import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";

const router = Router();
router.use(requireAuth);
// Todo este modulo requiere el permiso "inventory.manage" (lo tiene el
// Administrador por defecto; a Matías u otro usuario puntual se le puede
// sumar como permiso individual desde Usuarios).
router.use(requirePermission("inventory.manage"));

// Listado simple de artículos, con la cantidad actualmente prestada (sin
// devolver) de cada uno, para saber cuánto queda disponible.
router.get("/items", async (_req, res) => {
  const items = await prisma.inventoryItem.findMany({
    orderBy: { name: "asc" },
    include: { loans: { where: { returnedAt: null } } },
  });

  const result = items.map((item: any) => {
    const lent = item.loans.reduce((sum: number, l: any) => sum + l.quantity, 0);
    const { loans, ...rest } = item;
    return { ...rest, lent, available: item.quantity - lent };
  });

  res.json(result);
});

const itemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().nonnegative(),
});

router.post("/items", async (req: AuthenticatedRequest, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = await prisma.inventoryItem.create({ data: parsed.data });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "inventory_item",
    entityId: created.id,
    afterData: created,
    ipAddress: req.ip,
  });

  res.status(201).json(created);
});

router.put("/items/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const before = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Artículo no encontrado" });

  const updated = await prisma.inventoryItem.update({ where: { id }, data: parsed.data });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "inventory_item",
    entityId: id,
    beforeData: before,
    afterData: updated,
    ipAddress: req.ip,
  });

  res.json(updated);
});

router.post("/items/:id/toggle-active", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: "Artículo no encontrado" });

  const updated = await prisma.inventoryItem.update({
    where: { id },
    data: { active: !item.active },
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "inventory_item",
    entityId: id,
    beforeData: { active: item.active },
    afterData: { active: updated.active },
    ipAddress: req.ip,
  });

  res.json(updated);
});

// Préstamos: a un asociado existente (affiliateId) o a cualquier persona
// (borrowerName, texto libre) — se exige exactamente uno de los dos.
router.get("/loans", async (req, res) => {
  const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;
  const onlyActive = req.query.active === "true";

  const loans = await prisma.inventoryLoan.findMany({
    where: {
      itemId,
      returnedAt: onlyActive ? null : undefined,
    },
    include: { item: true, affiliate: true },
    orderBy: { deliveredAt: "desc" },
  });
  res.json(loans);
});

const loanSchema = z
  .object({
    itemId: z.number().int(),
    quantity: z.number().int().positive(),
    affiliateId: z.number().int().optional().nullable(),
    borrowerName: z.string().min(1).optional().nullable(),
    deliveredAt: z.string().datetime().optional(),
    notes: z.string().optional().nullable(),
  })
  .refine((d) => !!d.affiliateId !== !!d.borrowerName, {
    message: "Hay que elegir un asociado o escribir el nombre de la persona, no ambos ni ninguno",
  });

router.post("/loans", async (req: AuthenticatedRequest, res) => {
  const parsed = loanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const item = await prisma.inventoryItem.findUnique({
    where: { id: data.itemId },
    include: { loans: { where: { returnedAt: null } } },
  });
  if (!item) return res.status(404).json({ error: "Artículo no encontrado" });

  const lent = item.loans.reduce((sum: number, l: any) => sum + l.quantity, 0);
  const available = item.quantity - lent;
  if (data.quantity > available) {
    return res.status(400).json({ error: `Solo quedan ${available} disponibles de "${item.name}"` });
  }

  const created = await prisma.inventoryLoan.create({
    data: {
      itemId: data.itemId,
      quantity: data.quantity,
      affiliateId: data.affiliateId ?? null,
      borrowerName: data.borrowerName ?? null,
      deliveredAt: data.deliveredAt ? new Date(data.deliveredAt) : new Date(),
      notes: data.notes ?? null,
      createdByUserId: req.user?.id,
    },
    include: { item: true, affiliate: true },
  });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "inventory_loan",
    entityId: created.id,
    afterData: created,
    ipAddress: req.ip,
  });

  res.status(201).json(created);
});

router.post("/loans/:id/return", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const loan = await prisma.inventoryLoan.findUnique({ where: { id } });
  if (!loan) return res.status(404).json({ error: "Préstamo no encontrado" });
  if (loan.returnedAt) return res.status(400).json({ error: "Ese préstamo ya figura devuelto" });

  const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;

  const updated = await prisma.inventoryLoan.update({
    where: { id },
    data: { returnedAt: new Date(), notes: notes ?? loan.notes },
    include: { item: true, affiliate: true },
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "inventory_loan",
    entityId: id,
    beforeData: loan,
    afterData: updated,
    ipAddress: req.ip,
  });

  res.json(updated);
});

export default router;
