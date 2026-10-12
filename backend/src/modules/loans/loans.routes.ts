import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission, userHasPermission } from "../../middleware/auth";
import { logAudit, logAffiliateEvent } from "../../middleware/audit";
import { recalculateOverdueInstallments } from "./mora";
import { generateOrdenCompraPdf } from "./forms";

const router = Router();
router.use(requireAuth);

const loanSchema = z.object({
  affiliateId: z.number(),
  loanType: z.string().min(1), // "Comercio" en la Orden de Compra
  amount: z.number().positive(),
  installmentsCount: z.number().int().positive(),
  grantedAt: z.string().datetime().optional(),
  // Numero de orden real (por ejemplo el del papel) en vez del automatico.
  orderNumber: z.string().trim().min(1).optional(),
});

// "1166" -> "A-000001166". Si ya viene con letras/guion se respeta tal cual.
function normalizeOrderNumber(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (/^\d+$/.test(value)) return `A-${value.padStart(9, "0")}`;
  return value;
}

// Genera el próximo número de orden de forma atómica (formato "A-000001166"),
// para que dos altas simultáneas nunca puedan repetir número.
async function nextOrderNumber(): Promise<string> {
  const counter = await prisma.$transaction(async (tx) => {
    const current = await tx.orderCounter.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, nextNumber: 1 },
    });
    const updated = await tx.orderCounter.update({
      where: { id: 1 },
      data: { nextNumber: current.nextNumber + 1 },
    });
    return current.nextNumber;
  });
  return `A-${String(counter).padStart(9, "0")}`;
}

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

  if (!loan) return res.status(404).json({ error: "Orden de compra no encontrada" });
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

  // Cambiar la fecha de la orden (por ejemplo para cargar una orden hecha
  // antes de usar el sistema) requiere un permiso especial.
  if (data.grantedAt || data.orderNumber) {
    if (!req.user || !(await userHasPermission(req.user, "orders.setDate"))) {
      return res.status(403).json({ error: "No tiene permiso para cambiar la fecha o el número de la orden" });
    }
  }
  if (data.grantedAt) {
    if (grantedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "La fecha de la orden no puede ser futura" });
    }
  }

  let orderNumber: string;
  if (data.orderNumber) {
    orderNumber = normalizeOrderNumber(data.orderNumber);
    const taken = await prisma.loan.findUnique({ where: { orderNumber } });
    if (taken) return res.status(400).json({ error: `Ya existe la orden N° ${orderNumber}` });
  } else {
    orderNumber = await nextOrderNumber();
  }

  const loan = await prisma.loan.create({
    data: {
      affiliateId: data.affiliateId,
      loanType: data.loanType,
      orderNumber,
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
    description: `Otorgamiento de orden de compra ${data.loanType} por $${data.amount} en ${data.installmentsCount} cuotas${data.grantedAt ? ` (fecha de la orden cargada manualmente: ${grantedAt.toLocaleDateString("es-AR")})` : ""}`,
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
    description: `Pago de $${amount} en cuota N° ${installment.number} de la orden de compra en ${installment.loan.loanType}`,
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

// Descarga la Orden de Compra en PDF, lista para que firme el afiliado.
router.get("/:id/forms/orden-compra", async (req, res) => {
  const id = Number(req.params.id);
  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      affiliate: { include: { company: true } },
      installments: { orderBy: { number: "asc" } },
    },
  });
  if (!loan) return res.status(404).json({ error: "Orden de compra no encontrada" });

  generateOrdenCompraPdf(res, loan, loan.affiliate);
});

// Corregir la fecha y/o el numero de una orden ya cargada (por ejemplo
// ordenes hechas antes del sistema). Requiere el permiso "orders.setDate".
// Si cambia la fecha, se recalculan los vencimientos de las cuotas que
// todavia NO estan pagas; las pagas no se tocan.
const editLoanSchema = z.object({
  grantedAt: z.string().datetime().optional(),
  orderNumber: z.string().trim().min(1).optional(),
});

router.put("/:id", requirePermission("affiliates.edit"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = editLoanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  if (!req.user || !(await userHasPermission(req.user, "orders.setDate"))) {
    return res.status(403).json({ error: "No tiene permiso para cambiar la fecha o el número de la orden" });
  }

  const loan = await prisma.loan.findUnique({ where: { id }, include: { installments: true } });
  if (!loan) return res.status(404).json({ error: "Orden de compra no encontrada" });

  const updateData: { grantedAt?: Date; orderNumber?: string } = {};
  const changes: string[] = [];

  if (data.orderNumber) {
    const orderNumber = normalizeOrderNumber(data.orderNumber);
    if (orderNumber !== loan.orderNumber) {
      const taken = await prisma.loan.findUnique({ where: { orderNumber } });
      if (taken) return res.status(400).json({ error: `Ya existe la orden N° ${orderNumber}` });
      updateData.orderNumber = orderNumber;
      changes.push(`número ${loan.orderNumber || "(sin número)"} → ${orderNumber}`);
    }
  }

  let newGrantedAt: Date | undefined;
  if (data.grantedAt) {
    newGrantedAt = new Date(data.grantedAt);
    if (newGrantedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "La fecha de la orden no puede ser futura" });
    }
    if (newGrantedAt.toDateString() !== loan.grantedAt.toDateString()) {
      updateData.grantedAt = newGrantedAt;
      changes.push(
        `fecha ${loan.grantedAt.toLocaleDateString("es-AR")} → ${newGrantedAt.toLocaleDateString("es-AR")}`
      );
    }
  }

  if (changes.length === 0) return res.json({ ok: true, unchanged: true });

  await prisma.$transaction(async (tx) => {
    await tx.loan.update({ where: { id }, data: updateData });

    if (updateData.grantedAt) {
      const unpaid = loan.installments.filter((i) => i.status !== "paid");
      for (const inst of unpaid) {
        const dueDate = new Date(updateData.grantedAt);
        dueDate.setMonth(dueDate.getMonth() + inst.number);
        await tx.loanInstallment.update({
          where: { id: inst.id },
          data: { dueDate, status: "pending" },
        });
      }
      // La mora calculada con las fechas viejas ya no vale: se descarta y
      // se vuelve a calcular sola al consultar la orden.
      await tx.loanInstallmentPenalty.deleteMany({
        where: { loanInstallmentId: { in: unpaid.map((i) => i.id) } },
      });
    }
  });

  await logAffiliateEvent({
    affiliateId: loan.affiliateId,
    eventType: "loan_edited",
    description: `Se corrigió la orden de compra ${loan.orderNumber || loan.id}: ${changes.join("; ")}`,
    referenceTable: "loans",
    referenceId: id,
    createdByUserId: req.user?.id,
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "loan",
    entityId: id,
    beforeData: { orderNumber: loan.orderNumber, grantedAt: loan.grantedAt },
    afterData: { orderNumber: updateData.orderNumber ?? loan.orderNumber, grantedAt: updateData.grantedAt ?? loan.grantedAt },
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

// Eliminar una orden de compra por completo (junto con sus cuotas, pagos
// y moras). A diferencia del resto del sistema, esto SÍ borra de verdad
// — reservado al administrador, para poder corregir errores de carga.
// Queda de todas formas una entrada en la auditoría con lo que se borró.
router.delete("/:id", requirePermission("orders.delete"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const loan = await prisma.loan.findUnique({
    where: { id },
    include: { installments: true },
  });
  if (!loan) return res.status(404).json({ error: "Orden de compra no encontrada" });

  const installmentIds = loan.installments.map((i) => i.id);

  await prisma.loanPayment.deleteMany({ where: { loanInstallmentId: { in: installmentIds } } });
  await prisma.loanInstallmentPenalty.deleteMany({ where: { loanInstallmentId: { in: installmentIds } } });
  await prisma.loanInstallment.deleteMany({ where: { loanId: id } });
  await prisma.loan.delete({ where: { id } });

  await logAffiliateEvent({
    affiliateId: loan.affiliateId,
    eventType: "loan_deleted",
    description: `Se eliminó la orden de compra ${loan.orderNumber || loan.id} (${loan.loanType})`,
    createdByUserId: req.user?.id,
  });

  await logAudit({
    userId: req.user?.id,
    action: "delete",
    entityType: "loan",
    entityId: id,
    beforeData: loan,
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

export default router;
