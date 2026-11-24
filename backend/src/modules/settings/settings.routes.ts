import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";
import { getClosingDay, statementShift } from "../loans/statement";

const router = Router();
router.use(requireAuth);

// Historial de tasas cargadas (nunca se borra ni se pisa un valor).
router.get("/interest-rate", async (_req, res) => {
  const rates = await prisma.interestRateSettings.findMany({
    orderBy: { effectiveFrom: "desc" },
  });
  res.json(rates);
});

const rateSchema = z.object({
  rateType: z.enum(["daily", "monthly"]),
  rateValue: z.number().positive(),
});

// Cargar una tasa nueva: cierra la vigente (si existe) con effectiveTo = ahora
// y crea una fila nueva. Asi queda historial de que tasa regia en cada momento.
router.post("/interest-rate", requirePermission("settings.manage"), async (req: AuthenticatedRequest, res) => {
  const parsed = rateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const now = new Date();

  const current = await prisma.interestRateSettings.findFirst({
    where: { effectiveTo: null },
  });
  if (current) {
    await prisma.interestRateSettings.update({
      where: { id: current.id },
      data: { effectiveTo: now },
    });
  }

  const created = await prisma.interestRateSettings.create({
    data: {
      rateType: parsed.data.rateType,
      rateValue: parsed.data.rateValue,
      effectiveFrom: now,
      createdByUserId: req.user?.id,
    },
  });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "interest_rate_settings",
    entityId: created.id,
    afterData: created,
    ipAddress: req.ip,
  });

  res.status(201).json(created);
});

// Numeración de las Órdenes de Compra: permite alinear el correlativo con
// el que ya se venía usando en papel (ej. si iban por la A-000001166, se
// carga ese número una vez y el sistema sigue solo desde ahí).
router.get("/order-counter", async (_req, res) => {
  const counter = await prisma.orderCounter.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, nextNumber: 1 },
  });
  res.json(counter);
});

const orderCounterSchema = z.object({ nextNumber: z.number().int().positive() });

router.post("/order-counter", requirePermission("settings.manage"), async (req: AuthenticatedRequest, res) => {
  const parsed = orderCounterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.orderCounter.upsert({
    where: { id: 1 },
    update: { nextNumber: parsed.data.nextNumber },
    create: { id: 1, nextNumber: parsed.data.nextNumber },
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "order_counter",
    entityId: 1,
    afterData: updated,
    ipAddress: req.ip,
  });

  res.json(updated);
});

// Dia de cierre del resumen (como una tarjeta): las ordenes hechas despues de
// ese dia pasan al resumen del mes siguiente. Sin dia cargado, no se corre nada.
router.get("/closing-day", async (_req, res) => {
  const row = await prisma.statementSetting.findUnique({ where: { id: 1 } });
  res.json({ closingDay: row?.closingDay ?? null, updatedAt: row?.updatedAt ?? null });
});

// Revisión de vencimientos de órdenes ya cargadas con el día de cierre actual:
// una orden cargada antes de configurar el cierre (o con otro día de cierre)
// puede tener su primera cuota en un mes distinto al que le corresponde.
async function dueDateChanges() {
  const closingDay = await getClosingDay();
  const ym = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).format(d);
  const loans = await prisma.loan.findMany({
    where: { status: { in: ["active", "overdue", "pending", "approved"] } },
    include: {
      affiliate: { select: { firstName: true, lastName: true, affiliateNumber: true } },
      installments: { orderBy: { number: "asc" } },
    },
  });
  const changes: { installmentId: number; loanId: number; order: string; affiliate: string; cuota: string; from: Date; to: Date }[] = [];
  for (const loan of loans) {
    const shift = statementShift(loan.grantedAt, closingDay);
    for (const inst of loan.installments) {
      if (inst.status === "paid" || inst.paidAmount > 0) continue; // no se tocan las ya cobradas
      const to = new Date(loan.grantedAt);
      to.setMonth(to.getMonth() + inst.number - 1 + shift);
      if (ym(to) !== ym(inst.dueDate)) {
        changes.push({
          installmentId: inst.id, loanId: loan.id, order: loan.orderNumber || String(loan.id),
          affiliate: `${loan.affiliate.lastName} ${loan.affiliate.firstName} (${loan.affiliate.affiliateNumber})`,
          cuota: `${inst.number}/${loan.installmentsCount}`, from: inst.dueDate, to,
        });
      }
    }
  }
  return { closingDay, changes };
}

router.get("/closing-day/recalculate", requirePermission("settings.manage"), async (_req, res) => {
  const { closingDay, changes } = await dueDateChanges();
  res.json({ closingDay, count: changes.length, sample: changes.slice(0, 200) });
});

router.post("/closing-day/recalculate", requirePermission("settings.manage"), async (req: AuthenticatedRequest, res) => {
  const { changes } = await dueDateChanges();
  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.loanInstallment.update({ where: { id: c.installmentId }, data: { dueDate: c.to } });
    }
  });
  await logAudit({
    userId: req.user?.id, action: "update", entityType: "loan_installments", entityId: 0,
    afterData: { recalculated: changes.length, loans: Array.from(new Set(changes.map((c) => c.loanId))) },
    ipAddress: req.ip,
  });
  res.json({ updated: changes.length });
});

const closingDaySchema = z.object({ closingDay: z.number().int().min(1).max(31).nullable() });

router.post("/closing-day", requirePermission("settings.manage"), async (req: AuthenticatedRequest, res) => {
  const parsed = closingDaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "El día de cierre debe estar entre 1 y 31" });

  const before = await prisma.statementSetting.findUnique({ where: { id: 1 } });
  const updated = await prisma.statementSetting.upsert({
    where: { id: 1 },
    update: { closingDay: parsed.data.closingDay, updatedByUserId: req.user?.id },
    create: { id: 1, closingDay: parsed.data.closingDay, updatedByUserId: req.user?.id },
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "statement_settings",
    entityId: 1,
    beforeData: before,
    afterData: updated,
    ipAddress: req.ip,
  });
  res.json({ closingDay: updated.closingDay, updatedAt: updated.updatedAt });
});

// Descuentos de Farmacia por tipo de socio.
router.get("/pharmacy-discounts", requirePermission("settings.view"), async (_req, res) => {
  res.json(await prisma.pharmacyDiscountSetting.findMany({ orderBy: { socioType: "asc" } }));
});

const pharmacyDiscountSchema = z.object({
  socioType: z.string().min(1),
  medicinesPct: z.number().min(0).max(100),
  productsPct: z.number().min(0).max(100),
});

router.post("/pharmacy-discounts", requirePermission("settings.manage"), async (req: AuthenticatedRequest, res) => {
  const parsed = pharmacyDiscountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { socioType, medicinesPct, productsPct } = parsed.data;
  const updated = await prisma.pharmacyDiscountSetting.upsert({
    where: { socioType },
    update: { medicinesPct, productsPct, updatedByUserId: req.user?.id },
    create: { socioType, medicinesPct, productsPct, updatedByUserId: req.user?.id },
  });
  await logAudit({
    userId: req.user?.id, action: "update", entityType: "pharmacy_discount_setting", entityId: updated.id,
    afterData: { socioType, medicinesPct, productsPct }, ipAddress: req.ip,
  });
  res.json(updated);
});

// Valor de cuota por defecto segun el tipo de socio. Cualquier usuario
// autenticado puede consultarlo (se usa para precargar el campo al cargar
// o editar un asociado), pero solo el administrador puede modificarlo.
router.get("/membership-fees", async (_req, res) => {
  const fees = await prisma.membershipFeeSetting.findMany({ orderBy: { socioType: "asc" } });
  res.json(fees);
});

const membershipFeeSchema = z.object({
  socioType: z.string().min(1),
  feeAmount: z.number().nonnegative(),
});

router.post("/membership-fees", requirePermission("settings.manage"), async (req: AuthenticatedRequest, res) => {
  const parsed = membershipFeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.membershipFeeSetting.upsert({
    where: { socioType: parsed.data.socioType },
    update: { feeAmount: parsed.data.feeAmount, updatedByUserId: req.user?.id },
    create: {
      socioType: parsed.data.socioType,
      feeAmount: parsed.data.feeAmount,
      updatedByUserId: req.user?.id,
    },
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "membership_fee_setting",
    entityId: updated.id,
    afterData: updated,
    ipAddress: req.ip,
  });

  res.json(updated);
});

export default router;
