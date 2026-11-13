import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import ExcelJS from "exceljs";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission, requireAreaAccess } from "../../middleware/auth";
import { logAudit, logAffiliateEvent } from "../../middleware/audit";
import { computeLiquidacionData, parseMonth } from "../companies/liquidacionMensual";

const router = Router();
router.use(requireAuth);
// Todo el modulo (cobranzas de empresas + caja) requiere el permiso
// "finance.manage": lo tiene el Administrador y se le puede dar a un rol
// o a un usuario puntual.
router.use(requireAreaAccess("finance"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const round2 = (n: number) => Number(n.toFixed(2));

// "AAAA-MM-DD" -> mediodia de Argentina (para que no cambie de dia por zona horaria)
function dayNoon(value: string): Date {
  return new Date(`${value}T12:00:00-03:00`);
}
function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00-03:00`);
}
function nextDayStart(value: string): Date {
  const d = dayStart(value);
  return new Date(d.getTime() + 24 * 3600 * 1000);
}
function todayAR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)");

// ---- Cuentas y categorias (con valores iniciales la primera vez) -----

const DEFAULT_ACCOUNTS = ["Efectivo", "Banco"];
const DEFAULT_CATEGORIES: { name: string; kind: "income" | "expense" }[] = [
  { name: "Cobranza de empresas", kind: "income" },
  { name: "Cuotas sociales (cobro directo)", kind: "income" },
  { name: "Otros ingresos", kind: "income" },
  { name: "Insumos y librería", kind: "expense" },
  { name: "Sueldos", kind: "expense" },
  { name: "Alquiler y servicios", kind: "expense" },
  { name: "Impuestos y tasas", kind: "expense" },
  { name: "Otros egresos", kind: "expense" },
];

async function ensureDefaults() {
  if ((await prisma.cashAccount.count()) === 0) {
    for (const name of DEFAULT_ACCOUNTS) await prisma.cashAccount.create({ data: { name } });
  }
  if ((await prisma.cashCategory.count()) === 0) {
    for (const c of DEFAULT_CATEGORIES) await prisma.cashCategory.create({ data: c });
  }
}

router.get("/accounts", async (_req, res) => {
  await ensureDefaults();
  res.json(await prisma.cashAccount.findMany({ orderBy: { name: "asc" } }));
});

router.post("/accounts", async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ name: z.string().trim().min(1), openingBalance: z.number().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const exists = await prisma.cashAccount.findUnique({ where: { name: parsed.data.name } });
  if (exists) return res.status(400).json({ error: "Ya existe una cuenta con ese nombre" });
  const created = await prisma.cashAccount.create({ data: { name: parsed.data.name, openingBalance: parsed.data.openingBalance ?? 0 } });
  await logAudit({ userId: req.user?.id, action: "create", entityType: "cash_account", entityId: created.id, afterData: created, ipAddress: req.ip });
  res.status(201).json(created);
});

router.put("/accounts/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = z
    .object({ name: z.string().trim().min(1).optional(), openingBalance: z.number().optional(), active: z.boolean().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const before = await prisma.cashAccount.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Cuenta no encontrada" });
  const updated = await prisma.cashAccount.update({ where: { id }, data: parsed.data });
  await logAudit({ userId: req.user?.id, action: "update", entityType: "cash_account", entityId: id, beforeData: before, afterData: updated, ipAddress: req.ip });
  res.json(updated);
});

router.get("/categories", async (_req, res) => {
  await ensureDefaults();
  res.json(await prisma.cashCategory.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] }));
});

router.post("/categories", async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ name: z.string().trim().min(1), kind: z.enum(["income", "expense"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const exists = await prisma.cashCategory.findFirst({ where: { name: parsed.data.name, kind: parsed.data.kind } });
  if (exists) return res.status(400).json({ error: "Esa categoría ya existe" });
  const created = await prisma.cashCategory.create({ data: parsed.data });
  await logAudit({ userId: req.user?.id, action: "create", entityType: "cash_category", entityId: created.id, afterData: created, ipAddress: req.ip });
  res.status(201).json(created);
});

router.put("/categories/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ name: z.string().trim().min(1).optional(), active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const before = await prisma.cashCategory.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Categoría no encontrada" });
  const updated = await prisma.cashCategory.update({ where: { id }, data: parsed.data });
  await logAudit({ userId: req.user?.id, action: "update", entityType: "cash_category", entityId: id, beforeData: before, afterData: updated, ipAddress: req.ip });
  res.json(updated);
});

// ---- Movimientos (caja) -------------------------------------------------

const movementSchema = z.object({
  date: dateStr,
  type: z.enum(["income", "expense"]),
  amount: z.number().positive("El monto debe ser mayor a 0"),
  concept: z.string().trim().min(1, "Indicá el concepto"),
  notes: z.string().optional().nullable(),
  accountId: z.number().int(),
  categoryId: z.number().int().optional().nullable(),
});

function movementWhere(q: any) {
  const where: any = {};
  if (q.from || q.to) {
    where.date = {};
    if (q.from) where.date.gte = dayStart(String(q.from));
    if (q.to) where.date.lt = nextDayStart(String(q.to));
  }
  if (q.type === "income" || q.type === "expense") where.type = q.type;
  if (q.accountId) where.accountId = Number(q.accountId);
  if (q.categoryId) where.categoryId = Number(q.categoryId);
  if (q.q) where.concept = { contains: String(q.q), mode: "insensitive" };
  if (q.includeVoided !== "true") where.voided = false;
  return where;
}

router.get("/movements", async (req, res) => {
  const movements = await prisma.cashMovement.findMany({
    where: movementWhere(req.query),
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: {
      account: true,
      category: true,
      attachments: { select: { id: true, fileName: true, mimeType: true, size: true } },
    },
    take: 500,
  });
  res.json(movements);
});

router.post("/movements", async (req: AuthenticatedRequest, res) => {
  const parsed = movementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  if (d.date > todayAR()) return res.status(400).json({ error: "La fecha no puede ser futura" });

  const account = await prisma.cashAccount.findUnique({ where: { id: d.accountId } });
  if (!account) return res.status(400).json({ error: "Cuenta inexistente" });
  if (d.categoryId) {
    const cat = await prisma.cashCategory.findUnique({ where: { id: d.categoryId } });
    if (!cat || cat.kind !== d.type) return res.status(400).json({ error: "La categoría no corresponde al tipo de movimiento" });
  }

  const created = await prisma.cashMovement.create({
    data: {
      date: dayNoon(d.date),
      type: d.type,
      amount: round2(d.amount),
      concept: d.concept,
      notes: d.notes || null,
      accountId: d.accountId,
      categoryId: d.categoryId ?? null,
      createdByUserId: req.user?.id,
    },
  });
  await logAudit({ userId: req.user?.id, action: "create", entityType: "cash_movement", entityId: created.id, afterData: created, ipAddress: req.ip });
  res.status(201).json(created);
});

router.post("/movements/:id/void", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ reason: z.string().trim().min(1, "Indicá el motivo") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const before = await prisma.cashMovement.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Movimiento no encontrado" });
  if (before.voided) return res.status(400).json({ error: "El movimiento ya está anulado" });
  if (before.source === "company_payment") {
    return res.status(400).json({ error: "Este ingreso viene de una cobranza de empresa: anulá la cobranza desde Cobranzas" });
  }
  const updated = await prisma.cashMovement.update({
    where: { id },
    data: { voided: true, voidedReason: parsed.data.reason, voidedAt: new Date() },
  });
  await logAudit({ userId: req.user?.id, action: "update", entityType: "cash_movement", entityId: id, beforeData: before, afterData: updated, ipAddress: req.ip });
  res.json(updated);
});

// Comprobantes
router.post("/movements/:id/attachments", upload.single("file"), async (req: AuthenticatedRequest, res) => {
  const movementId = Number(req.params.id);
  if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });
  if (!ALLOWED_MIME.includes(req.file.mimetype)) {
    return res.status(400).json({ error: "Solo se aceptan fotos (JPG, PNG, WEBP) o PDF" });
  }
  const movement = await prisma.cashMovement.findUnique({ where: { id: movementId }, include: { attachments: { select: { id: true } } } });
  if (!movement) return res.status(404).json({ error: "Movimiento no encontrado" });
  if (movement.attachments.length >= 5) return res.status(400).json({ error: "Máximo 5 comprobantes por movimiento" });

  const created = await prisma.cashAttachment.create({
    data: {
      movementId,
      fileName: req.file.originalname.slice(0, 200),
      mimeType: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
    },
    select: { id: true, fileName: true, mimeType: true, size: true },
  });
  await logAudit({ userId: req.user?.id, action: "create", entityType: "cash_attachment", entityId: created.id, afterData: { movementId, ...created }, ipAddress: req.ip });
  res.status(201).json(created);
});

router.get("/movements/:id/attachments/:attId", async (req, res) => {
  const att = await prisma.cashAttachment.findFirst({
    where: { id: Number(req.params.attId), movementId: Number(req.params.id) },
  });
  if (!att) return res.status(404).json({ error: "Comprobante no encontrado" });
  res.setHeader("Content-Type", att.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${att.fileName.replace(/"/g, "")}"`);
  res.send(Buffer.from(att.data));
});

// Resumen del periodo: ingresos, egresos, saldo por cuenta y por categoria.
async function buildSummary(from: string, to: string) {
  await ensureDefaults();
  const periodWhere = { voided: false, date: { gte: dayStart(from), lt: nextDayStart(to) } };
  const [periodMovs, accounts, untilEnd] = await Promise.all([
    prisma.cashMovement.findMany({ where: periodWhere, include: { category: true } }),
    prisma.cashAccount.findMany({ orderBy: { name: "asc" } }),
    prisma.cashMovement.findMany({ where: { voided: false, date: { lt: nextDayStart(to) } } }),
  ]);

  const sum = (rows: any[], type: string) => round2(rows.filter((m) => m.type === type).reduce((a, m) => a + m.amount, 0));
  const income = sum(periodMovs, "income");
  const expense = sum(periodMovs, "expense");

  const byAccount = accounts.map((a: any) => {
    const movs = untilEnd.filter((m: any) => m.accountId === a.id);
    const balance = round2(a.openingBalance + sum(movs, "income") - sum(movs, "expense"));
    const inPeriod = periodMovs.filter((m: any) => m.accountId === a.id);
    return { id: a.id, name: a.name, active: a.active, balance, income: sum(inPeriod, "income"), expense: sum(inPeriod, "expense") };
  });

  const catMap = new Map<string, { name: string; type: string; total: number }>();
  for (const m of periodMovs as any[]) {
    const name = m.category?.name || "Sin categoría";
    const key = `${m.type}:${name}`;
    const row = catMap.get(key) || { name, type: m.type, total: 0 };
    row.total = round2(row.total + m.amount);
    catMap.set(key, row);
  }

  return {
    from,
    to,
    income,
    expense,
    net: round2(income - expense),
    totalBalance: round2(byAccount.reduce((a: number, x: any) => a + x.balance, 0)),
    byAccount,
    byCategory: Array.from(catMap.values()).sort((a, b) => b.total - a.total),
  };
}

function periodFromQuery(q: any): { from: string; to: string } {
  const today = todayAR();
  const from = typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : `${today.slice(0, 7)}-01`;
  const to = typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to : today;
  return { from, to };
}

router.get("/summary", async (req, res) => {
  const { from, to } = periodFromQuery(req.query);
  res.json(await buildSummary(from, to));
});

router.get("/export", async (req, res) => {
  const { from, to } = periodFromQuery(req.query);
  const [summary, movements] = await Promise.all([
    buildSummary(from, to),
    prisma.cashMovement.findMany({
      where: movementWhere({ ...req.query, from, to, includeVoided: "true" }),
      orderBy: [{ date: "asc" }, { id: "asc" }],
      include: { account: true, category: true },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Mutual Trabajadores Petrolero Privado de Tierra del Fuego";
  const NAVY = "FF12304F";
  const style = (row: ExcelJS.Row) => {
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
  };
  const money = '"$" #,##0.00';

  const ws = wb.addWorksheet("Movimientos", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Fecha", key: "date", width: 12 },
    { header: "Tipo", key: "type", width: 10 },
    { header: "Categoría", key: "cat", width: 30 },
    { header: "Concepto", key: "concept", width: 44 },
    { header: "Cuenta", key: "account", width: 16 },
    { header: "Ingreso", key: "income", width: 16 },
    { header: "Egreso", key: "expense", width: 16 },
    { header: "Estado", key: "state", width: 22 },
  ];
  style(ws.getRow(1));
  for (const m of movements as any[]) {
    const r = ws.addRow({
      date: m.date,
      type: m.type === "income" ? "Ingreso" : "Egreso",
      cat: m.category?.name || "Sin categoría",
      concept: m.concept,
      account: m.account.name,
      income: m.type === "income" ? m.amount : null,
      expense: m.type === "expense" ? m.amount : null,
      state: m.voided ? `ANULADO: ${m.voidedReason || ""}` : "",
    });
    r.getCell("date").numFmt = "dd/mm/yyyy";
    r.getCell("income").numFmt = money;
    r.getCell("expense").numFmt = money;
    if (m.voided) r.font = { color: { argb: "FF999999" }, strike: true };
  }

  const rs = wb.addWorksheet("Resumen");
  rs.columns = [{ width: 36 }, { width: 18 }, { width: 18 }, { width: 18 }];
  rs.addRow([`Resumen del ${from} al ${to}`]).font = { bold: true, size: 13 };
  rs.addRow([]);
  rs.addRow(["Ingresos", summary.income]).getCell(2).numFmt = money;
  rs.addRow(["Egresos", summary.expense]).getCell(2).numFmt = money;
  rs.addRow(["Resultado del período", summary.net]).getCell(2).numFmt = money;
  rs.addRow([]);
  style(rs.addRow(["Cuenta", "Ingresos", "Egresos", "Saldo al " + to]));
  for (const a of summary.byAccount) {
    const r = rs.addRow([a.name, a.income, a.expense, a.balance]);
    [2, 3, 4].forEach((i) => (r.getCell(i).numFmt = money));
  }
  rs.addRow([]);
  style(rs.addRow(["Categoría", "Tipo", "Total"]));
  for (const c of summary.byCategory) {
    const r = rs.addRow([c.name, c.type === "income" ? "Ingreso" : "Egreso", c.total]);
    r.getCell(3).numFmt = money;
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="caja-${from}-a-${to}.xlsx"`);
  res.send(buffer);
});

// ---- Cobranzas de empresas ---------------------------------------------

// Cuanto se le liquido a la empresa en el mes y cuanto ya se cobro.
// Cuando ya hubo un cobro, "lo liquidado" es la foto que se guardo en el
// primero (porque al marcar las cuotas como pagas, el calculo en vivo cambia).
async function collectionStatus(companyId: number, month: string) {
  const existing = await prisma.companyPayment.findMany({
    where: { companyId, month, voided: false },
    orderBy: { id: "asc" },
  });
  const alreadyPaid = round2(existing.reduce((a: number, p: any) => a + p.amount, 0));
  let expected: number;
  let installmentsCount = 0;
  let feeTotal = 0;
  if (existing.length > 0) {
    expected = existing[0].expectedAmount;
  } else {
    const data = await computeLiquidacionData(companyId, month);
    if (!data) return null;
    expected = data.grandTotal;
    installmentsCount = data.installmentsCount;
    feeTotal = round2(data.feeTotal);
  }
  return { expected, alreadyPaid, remaining: round2(expected - alreadyPaid), installmentsCount, feeTotal, payments: existing.length, markedBefore: existing.some((p: any) => p.markedPaid) };
}

router.get("/collections/preview", async (req, res) => {
  const companyId = Number(req.query.companyId);
  const month = String(req.query.month || "");
  if (!companyId || !parseMonth(month)) return res.status(400).json({ error: "Empresa o mes inválido (AAAA-MM)" });
  const status = await collectionStatus(companyId, month);
  if (!status) return res.status(404).json({ error: "Empresa no encontrada" });
  res.json(status);
});

// Resumen del mes: por cada empresa, lo liquidado, lo cobrado y lo que falta.
router.get("/collections/summary", async (req, res) => {
  const month = String(req.query.month || "");
  if (!parseMonth(month)) return res.status(400).json({ error: "Mes inválido (AAAA-MM)" });
  const companies = await prisma.company.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const rows = [];
  for (const c of companies) {
    const st = await collectionStatus(c.id, month);
    if (!st) continue;
    if (st.expected === 0 && st.alreadyPaid === 0) continue; // empresa sin nada para descontar ese mes
    rows.push({ companyId: c.id, companyName: c.name, ...st });
  }
  const total = {
    expected: round2(rows.reduce((a, r) => a + r.expected, 0)),
    paid: round2(rows.reduce((a, r) => a + r.alreadyPaid, 0)),
    remaining: round2(rows.reduce((a, r) => a + r.remaining, 0)),
  };
  res.json({ month, rows, total });
});

// Revisión de vencimientos: cuotas de órdenes de compra que siguen impagas y
// vencen hasta el fin del mes elegido (lo que la empresa no descontó o todavía
// no se cobró), agrupables por empresa. Sirve para controlar después de cargar
// una cobranza.
router.get("/collections/overdue", async (req, res) => {
  const month = String(req.query.month || "");
  const range = parseMonth(month);
  if (!range) return res.status(400).json({ error: "Mes inválido (AAAA-MM)" });
  const now = new Date();
  const rows = await prisma.loanInstallment.findMany({
    where: {
      status: { not: "paid" },
      dueDate: { lt: range.end },
      loan: { status: { in: ["active", "overdue", "pending", "approved"] }, affiliate: { status: "active" } },
    },
    include: { loan: { include: { affiliate: { select: { id: true, firstName: true, lastName: true, affiliateNumber: true, company: { select: { id: true, name: true } } } } } } },
    orderBy: [{ dueDate: "asc" }],
    take: 1000,
  });
  const out = rows.map((i: any) => ({
    installmentId: i.id,
    companyName: i.loan.affiliate.company?.name || "Sin empresa",
    affiliateId: i.loan.affiliate.id,
    affiliate: `${i.loan.affiliate.lastName}, ${i.loan.affiliate.firstName}`,
    affiliateNumber: i.loan.affiliate.affiliateNumber,
    orderNumber: i.loan.orderNumber,
    installment: `${i.number}/${i.loan.installmentsCount}`,
    dueDate: i.dueDate,
    balance: round2(i.amount - i.paidAmount),
    daysOverdue: Math.max(0, Math.floor((now.getTime() - i.dueDate.getTime()) / 86_400_000)),
  }));
  out.sort((a: any, b: any) => a.companyName.localeCompare(b.companyName) || a.dueDate - b.dueDate);
  res.json({ month, rows: out, total: round2(out.reduce((s: number, r: any) => s + r.balance, 0)) });
});

router.get("/collections", async (req, res) => {
  const where: any = {};
  if (req.query.month) where.month = String(req.query.month);
  if (req.query.companyId) where.companyId = Number(req.query.companyId);
  const list = await prisma.companyPayment.findMany({
    where,
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    include: { company: true, account: true, _count: { select: { installments: true } } },
    take: 300,
  });
  res.json(list);
});

const collectionSchema = z.object({
  companyId: z.number().int(),
  month: z.string(),
  receivedAt: dateStr,
  amount: z.number().positive("El monto debe ser mayor a 0"),
  accountId: z.number().int(),
  notes: z.string().optional().nullable(),
  // Si el monto es menor a lo liquidado, por defecto NO se marcan las cuotas
  // como pagas; esto permite marcarlas igual.
  forceMarkPaid: z.boolean().optional(),
});

router.post("/collections", async (req: AuthenticatedRequest, res) => {
  const parsed = collectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  if (!parseMonth(d.month)) return res.status(400).json({ error: "Mes inválido (AAAA-MM)" });
  if (d.receivedAt > todayAR()) return res.status(400).json({ error: "La fecha no puede ser futura" });

  const [company, account] = await Promise.all([
    prisma.company.findUnique({ where: { id: d.companyId } }),
    prisma.cashAccount.findUnique({ where: { id: d.accountId } }),
  ]);
  if (!company) return res.status(404).json({ error: "Empresa no encontrada" });
  if (!account) return res.status(400).json({ error: "Cuenta inexistente" });

  const status = await collectionStatus(d.companyId, d.month);
  if (!status) return res.status(404).json({ error: "Empresa no encontrada" });

  const amount = round2(d.amount);
  const coversAll = round2(status.alreadyPaid + amount) >= status.expected;
  const shouldMark = coversAll || d.forceMarkPaid === true;

  await ensureDefaults();
  const category = await prisma.cashCategory.findFirst({ where: { name: "Cobranza de empresas", kind: "income" } });

  // Cuotas de ordenes de compra que se marcan como pagas (solo si todavia no se marcaron).
  let installmentsToMark: { id: number; remaining: number; loanId: number; affiliateId: number }[] = [];
  if (shouldMark && !status.markedBefore) {
    const data = await computeLiquidacionData(d.companyId, d.month);
    const ids = new Set<number>();
    data?.people.forEach((p) => p.lines.forEach((l) => l.installmentId && ids.add(l.installmentId)));
    if (ids.size > 0) {
      const rows = await prisma.loanInstallment.findMany({
        where: { id: { in: Array.from(ids) }, status: { not: "paid" } },
        include: { loan: true },
      });
      installmentsToMark = rows.map((r: any) => ({
        id: r.id,
        remaining: round2(r.amount - r.paidAmount),
        loanId: r.loanId,
        affiliateId: r.loan.affiliateId,
      }));
    }
  }

  const result = await prisma.$transaction(
    async (tx: any) => {
      const payment = await tx.companyPayment.create({
        data: {
          companyId: d.companyId,
          month: d.month,
          receivedAt: dayNoon(d.receivedAt),
          amount,
          expectedAmount: status.expected,
          accountId: d.accountId,
          markedPaid: installmentsToMark.length > 0,
          notes: d.notes || null,
          createdByUserId: req.user?.id,
        },
      });

      await tx.cashMovement.create({
        data: {
          date: dayNoon(d.receivedAt),
          type: "income",
          amount,
          concept: `Cobranza ${company.name} — ${d.month}`,
          notes: d.notes || null,
          accountId: d.accountId,
          categoryId: category?.id ?? null,
          source: "company_payment",
          companyPaymentId: payment.id,
          createdByUserId: req.user?.id,
        },
      });

      const touchedLoans = new Set<number>();
      for (const inst of installmentsToMark) {
        const lp = await tx.loanPayment.create({
          data: { loanInstallmentId: inst.id, amount: inst.remaining, registeredByUserId: req.user?.id },
        });
        await tx.loanInstallment.update({
          where: { id: inst.id },
          data: { paidAmount: { increment: inst.remaining }, status: "paid", paidAt: dayNoon(d.receivedAt) },
        });
        await tx.companyPaymentInstallment.create({
          data: { companyPaymentId: payment.id, loanInstallmentId: inst.id, loanPaymentId: lp.id, amount: inst.remaining },
        });
        touchedLoans.add(inst.loanId);
      }
      // Ordenes que quedaron totalmente saldadas
      for (const loanId of touchedLoans) {
        const remaining = await tx.loanInstallment.count({ where: { loanId, status: { not: "paid" } } });
        if (remaining === 0) {
          await tx.loan.update({ where: { id: loanId }, data: { status: "cancelled", cancelledAt: new Date(), cancellationReason: "Saldado" } });
        } else {
          // Si ya no le quedan cuotas vencidas, la orden deja de figurar en mora.
          const stillOverdue = await tx.loanInstallment.count({ where: { loanId, status: "overdue" } });
          const loan = await tx.loan.findUnique({ where: { id: loanId } });
          if (stillOverdue === 0 && loan?.status === "overdue") {
            await tx.loan.update({ where: { id: loanId }, data: { status: "active" } });
          }
        }
      }
      return payment;
    },
    { timeout: 120000, maxWait: 20000 }
  );

  // Un evento por asociado en su historial
  const byAffiliate = new Map<number, { total: number; count: number }>();
  for (const i of installmentsToMark) {
    const row = byAffiliate.get(i.affiliateId) || { total: 0, count: 0 };
    row.total = round2(row.total + i.remaining);
    row.count++;
    byAffiliate.set(i.affiliateId, row);
  }
  for (const [affiliateId, row] of byAffiliate) {
    await logAffiliateEvent({
      affiliateId,
      eventType: "loan_payment",
      description: `Cuota(s) de órdenes de compra cobradas por la empresa (${d.month}): ${row.count} cuota(s), $${row.total}`,
      referenceTable: "company_payments",
      referenceId: result.id,
      createdByUserId: req.user?.id,
    });
  }

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "company_payment",
    entityId: result.id,
    afterData: { ...result, installmentsMarked: installmentsToMark.length },
    ipAddress: req.ip,
  });

  res.status(201).json({
    ...result,
    installmentsMarked: installmentsToMark.length,
    difference: round2(status.expected - status.alreadyPaid - amount),
  });
});

// Anular una cobranza: el ingreso queda anulado y las cuotas que se habian
// marcado como pagas vuelven a quedar pendientes.
router.post("/collections/:id/void", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ reason: z.string().trim().min(1, "Indicá el motivo") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const before = await prisma.companyPayment.findUnique({ where: { id }, include: { installments: true } });
  if (!before) return res.status(404).json({ error: "Cobranza no encontrada" });
  if (before.voided) return res.status(400).json({ error: "La cobranza ya está anulada" });

  await prisma.$transaction(
    async (tx: any) => {
      const touchedLoans = new Set<number>();
      for (const link of before.installments) {
        const inst = await tx.loanInstallment.findUnique({ where: { id: link.loanInstallmentId } });
        if (inst) {
          const newPaid = Math.max(0, round2(inst.paidAmount - link.amount));
          await tx.loanInstallment.update({
            where: { id: inst.id },
            // Al anular, una cuota que ya venció vuelve como vencida (no como pendiente).
            data: { paidAmount: newPaid, status: newPaid >= inst.amount ? "paid" : inst.dueDate < new Date() ? "overdue" : "pending", paidAt: newPaid >= inst.amount ? inst.paidAt : null },
          });
          touchedLoans.add(inst.loanId);
        }
        await tx.loanPayment.deleteMany({ where: { id: link.loanPaymentId } });
      }
      await tx.companyPaymentInstallment.deleteMany({ where: { companyPaymentId: id } });
      for (const loanId of touchedLoans) {
        const loan = await tx.loan.findUnique({ where: { id: loanId } });
        if (loan && loan.status === "cancelled" && loan.cancellationReason === "Saldado") {
          await tx.loan.update({ where: { id: loanId }, data: { status: "active", cancelledAt: null, cancellationReason: null } });
        }
      }
      await tx.companyPayment.update({ where: { id }, data: { voided: true, voidedReason: parsed.data.reason, voidedAt: new Date() } });
      await tx.cashMovement.updateMany({
        where: { companyPaymentId: id },
        data: { voided: true, voidedReason: `Cobranza anulada: ${parsed.data.reason}`, voidedAt: new Date() },
      });
    },
    { timeout: 120000, maxWait: 20000 }
  );

  await logAudit({ userId: req.user?.id, action: "update", entityType: "company_payment", entityId: id, beforeData: before, afterData: { voided: true, reason: parsed.data.reason }, ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
