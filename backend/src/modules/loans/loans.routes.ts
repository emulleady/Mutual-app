import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit, logAffiliateEvent } from "../../middleware/audit";
import { recalculateOverdueInstallments } from "./mora";

const router = Router();
router.use(requireAuth);

const loanSchema = z.object({
  affiliateId: z.number(),
  loanType: z.string().min(1),
  amount: z.number().positive(),
  installmentsCount: z.number().int().positive(),
  grantedAt: z.string().datetime().optional(),
});

// Prestamos activos e historicos de un afiliado (misma tabla, distinto status).
router.get("/affiliate/:affiliateId", async (req, res) => {
  const affiliateId = Number(req.params.affiliateId);
  const loans = await prisma.loan.findMany({
    where: { affiliateId },
    orderBy: { grantedAt: "desc" },
  });

  // Se recalcula la mora de cada prestamo antes de armar el resumen,
  // para que el listado muestre siempre el estado al dia sin tener
  // que entrar al detalle.
  await Promise.all(loans.map((l) => recalculateOverdueInstallments(l.id)));

  const summaries = await Promise.all(
    loans.map(async (loan) => {
      const installments = await prisma.loanInstallment.findMany({
        where: { loanId: loan.id },
        orderBy: { number: "asc" },
        include: { penalties: { orderBy: { calculatedAt: "desc" }, take: 1 } },
      });

      const paidCount = installments.filter((i) => i.status === "paid").length;
      const outstandingBalance = installments.reduce(
        (sum, i) => sum + (i.amount - i.paidAmount),
        0
      );
      const nextDue = installments.find((i) => i.status !== "paid");
      const totalPenalty = installments.reduce(
        (sum, i) => sum + (i.penalties[0]?.penaltyAmount || 0),
        0
      );
      const hasOverdue = installments.some((i) => i.status === "overdue");

      return {
        ...loan,
        status: hasOverdue && loan.status === "active" ? "overdue" : loan.status,
        paidInstallments: paidCount,
        totalInstallments: installments.length,
        outstandingBalance: Number(outstandingBalance.toFixed(2)),
        nextDueDate: nextDue?.dueDate ?? null,
        totalPenalty: Number(totalPenalty.toFixed(2)),
      };
    })
  );

  res.json(summaries);
});

// Detalle de un prestamo con sus cuotas (y mora recalculada al consultar).
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await recalculateOverdueInstallments(id);

  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      installments: {
        orderBy: { number: "asc" },
        include: { payments: true, penalties: { orderBy: { calculatedAt: "desc" }, take: 1 } },
      },
    },
  });

  if (!loan) return res.status(404).json({ error: "Préstamo no encontrado" });
  res.json(loan);
});

// Alta de un prestamo: genera automaticamente el plan de cuotas
// (una fila por cuota, con su fecha de vencimiento mensual).
router.post("/", requirePermission("affiliates.edit"), async (req: AuthenticatedRequest, res) => {
  const parsed = loanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;
  const installmentValue = Number((data.amount / data.installmentsCount).toFixed(2));
  const grantedAt = data.grantedAt ? new Date(data.grantedAt) : new Date();

  const loan = await prisma.loan.create({
    data: {
      affiliateId: data.affiliateId,
      loanType: data.loanType,
      amount: data.amount,
      installmentsCount: data.installmentsCount,
      installmentValue,
      grantedAt,
      createdByUserId: req.user?.id,
      installments: {
        create: Array.from({ length: data.installmentsCount }, (_, i) => {
          const dueDate = new Date(grantedAt);
          dueDate.setMonth(dueDate.getMonth() + i + 1);
          return { number: i + 1, dueDate, amount: installmentValue };
        }),
      },
    },
  });

  await logAffiliateEvent({
    affiliateId: data.affiliateId,
    eventType: "loan_granted",
    description: `Otorgamiento de préstamo ${data.loanType} por $${data.amount} en ${data.installmentsCount} cuotas`,
    referenceTable: "loans",
    referenceId: loan.id,
    createdByUserId: req.user?.id,
  });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "loan",
    entityId: loan.id,
    afterData: loan,
    ipAddress: req.ip,
  });

  res.status(201).json(loan);
});

// Registrar un pago sobre una cuota puntual.
const paymentSchema = z.object({ loanInstallmentId: z.number(), amount: z.number().positive() });

router.post("/payments", requirePermission("affiliates.edit"), async (req: AuthenticatedRequest, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { loanInstallmentId, amount } = parsed.data;
  const installment = await prisma.loanInstallment.findUnique({
    where: { id: loanInstallmentId },
    include: { loan: true },
  });
  if (!installment) return res.status(404).json({ error: "Cuota no encontrada" });

  const payment = await prisma.loanPayment.create({
    data: { loanInstallmentId, amount, registeredByUserId: req.user?.id },
  });

  const newPaidAmount = installment.paidAmount + amount;
  const isFullyPaid = newPaidAmount >= installment.amount;

  await prisma.loanInstallment.update({
    where: { id: loanInstallmentId },
    data: {
      paidAmount: newPaidAmount,
      status: isFullyPaid ? "paid" : installment.status,
      paidAt: isFullyPaid ? new Date() : installment.paidAt,
    },
  });

  // Si todas las cuotas del prestamo quedaron pagas, se marca cancelado
  // (saldado), sin borrar ningun registro.
  const remaining = await prisma.loanInstallment.count({
    where: { loanId: installment.loanId, status: { not: "paid" } },
  });
  if (remaining === 0) {
    await prisma.loan.update({ where: { id: installment.loanId }, data: { status: "cancelled", cancelledAt: new Date(), cancellationReason: "Saldado" } });
  }

  await logAffiliateEvent({
    affiliateId: installment.loan.affiliateId,
    eventType: "loan_payment",
    description: `Pago de $${amount} en cuota N° ${installment.number} del préstamo ${installment.loan.loanType}`,
    referenceTable: "loan_payments",
    referenceId: payment.id,
    createdByUserId: req.user?.id,
  });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "loan_payment",
    entityId: payment.id,
    afterData: payment,
    ipAddress: req.ip,
  });

  res.status(201).json(payment);
});

export default router;
