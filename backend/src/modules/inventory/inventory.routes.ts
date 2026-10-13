import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";
import { parseMonth } from "../companies/liquidacionMensual";

const router = Router();
router.use(requireAuth);
// Todo este modulo requiere el permiso "inventory.manage" (lo tiene el
// Administrador por defecto; a Matías u otro usuario puntual se le puede
// sumar como permiso individual desde Usuarios).
router.use(requirePermission("inventory.manage"));

const round2 = (n: number) => Number(n.toFixed(2));

// Listado simple de artículos, con la cantidad actualmente prestada (sin
// devolver) de cada uno, para saber cuánto queda disponible, y su valor.
router.get("/items", async (_req, res) => {
  const items = await prisma.inventoryItem.findMany({
    orderBy: { name: "asc" },
    include: { loans: { where: { returnedAt: null } } },
  });

  const result = items.map((item: any) => {
    const lent = item.loans.reduce((sum: number, l: any) => sum + l.quantity, 0);
    const { loans, ...rest } = item;
    return {
      ...rest,
      lent,
      available: item.quantity - lent,
      totalValue: round2(item.quantity * item.unitValue),
    };
  });

  res.json(result);
});

const itemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  unitValue: z.number().nonnegative().optional(),
  trackKm: z.boolean().optional(),
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

  // Si el artículo no tenía valor cargado y ahora sí, los préstamos que ya
  // se hicieron (que quedaron en $0) toman este valor, para que los totales
  // del mes y del historial reflejen lo entregado.
  if (before.unitValue === 0 && updated.unitValue > 0) {
    await prisma.inventoryLoan.updateMany({
      where: { itemId: id, unitValueAtLoan: 0 },
      data: { unitValueAtLoan: updated.unitValue },
    });
  }

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

// Compra de un artículo: suma stock y deja registrado cuánto costó.
const purchaseSchema = z.object({
  quantity: z.number().int().positive(),
  unitCost: z.number().nonnegative(),
  purchasedAt: z.string().datetime().optional(),
  notes: z.string().optional().nullable(),
  // Si es true, el costo de esta compra pasa a ser el valor del artículo.
  updateUnitValue: z.boolean().optional(),
});

router.post("/items/:id/purchases", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: "Artículo no encontrado" });

  const [purchase] = await prisma.$transaction([
    prisma.inventoryPurchase.create({
      data: {
        itemId: id,
        quantity: data.quantity,
        unitCost: data.unitCost,
        purchasedAt: data.purchasedAt ? new Date(data.purchasedAt) : new Date(),
        notes: data.notes ?? null,
        createdByUserId: req.user?.id,
      },
    }),
    prisma.inventoryItem.update({
      where: { id },
      data: {
        quantity: item.quantity + data.quantity,
        ...(data.updateUnitValue ? { unitValue: data.unitCost } : {}),
      },
    }),
  ]);

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "inventory_purchase",
    entityId: purchase.id,
    afterData: purchase,
    ipAddress: req.ip,
  });

  res.status(201).json(purchase);
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
    kmOut: z.number().int().nonnegative().optional().nullable(),
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

  // Vehículos: se presta de a uno y hay que anotar el kilometraje de salida,
  // que no puede ser menor al último que se registró de ese vehículo.
  let kmOut: number | null = null;
  if (item.trackKm) {
    if (data.quantity !== 1) {
      return res.status(400).json({ error: "Un vehículo se presta de a uno por vez" });
    }
    if (data.kmOut === undefined || data.kmOut === null) {
      return res.status(400).json({ error: `Falta el kilometraje actual de "${item.name}"` });
    }
    const last = await prisma.inventoryLoan.findFirst({
      where: { itemId: item.id },
      orderBy: { deliveredAt: "desc" },
    });
    const lastKm = last ? (last.kmIn ?? last.kmOut) : null;
    if (lastKm !== null && lastKm !== undefined && data.kmOut < lastKm) {
      return res.status(400).json({
        error: `El kilometraje no puede ser menor al último registrado (${lastKm} km)`,
      });
    }
    kmOut = data.kmOut;
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
      unitValueAtLoan: item.unitValue,
      kmOut,
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
  const loan = await prisma.inventoryLoan.findUnique({ where: { id }, include: { item: true } });
  if (!loan) return res.status(404).json({ error: "Préstamo no encontrado" });
  if (loan.returnedAt) return res.status(400).json({ error: "Ese préstamo ya figura devuelto" });

  const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;

  // Vehículos: al devolver hay que anotar el kilometraje de regreso.
  let kmIn: number | null = null;
  if (loan.item.trackKm) {
    const raw = req.body?.kmIn;
    if (raw === undefined || raw === null || raw === "" || !Number.isFinite(Number(raw))) {
      return res.status(400).json({ error: "Falta el kilometraje con el que se devuelve el vehículo" });
    }
    kmIn = Math.round(Number(raw));
    if (kmIn < 0 || (loan.kmOut !== null && kmIn < loan.kmOut)) {
      return res.status(400).json({
        error: `El kilometraje de regreso no puede ser menor al de salida (${loan.kmOut} km)`,
      });
    }
  }

  const updated = await prisma.inventoryLoan.update({
    where: { id },
    data: { returnedAt: new Date(), notes: notes ?? loan.notes, kmIn },
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

// Resumen del inventario: valor total en stock, y para el mes elegido
// (?month=AAAA-MM) lo entregado y lo comprado, con su valor.
router.get("/summary", async (req, res) => {
  const now = new Date();
  const monthParam =
    typeof req.query.month === "string" && req.query.month
      ? req.query.month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const range = parseMonth(monthParam);
  if (!range) return res.status(400).json({ error: "Mes inválido (usar AAAA-MM)" });

  const [items, loans, purchases] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { active: true } }),
    prisma.inventoryLoan.findMany({
      where: { deliveredAt: { gte: range.start, lt: range.end } },
      include: { item: true },
    }),
    prisma.inventoryPurchase.findMany({
      where: { purchasedAt: { gte: range.start, lt: range.end } },
      include: { item: true },
    }),
  ]);

  const inventoryValue = round2(items.reduce((sum: number, i: any) => sum + i.quantity * i.unitValue, 0));

  const deliveredByItem = new Map<number, { name: string; units: number; value: number }>();
  let deliveredValue = 0;
  let deliveredUnits = 0;
  for (const l of loans as any[]) {
    const value = l.quantity * l.unitValueAtLoan;
    deliveredValue += value;
    deliveredUnits += l.quantity;
    const entry = deliveredByItem.get(l.itemId) || { name: l.item.name, units: 0, value: 0 };
    entry.units += l.quantity;
    entry.value += value;
    deliveredByItem.set(l.itemId, entry);
  }

  let purchasedValue = 0;
  let purchasedUnits = 0;
  for (const p of purchases as any[]) {
    purchasedValue += p.quantity * p.unitCost;
    purchasedUnits += p.quantity;
  }

  // Kilómetros recorridos en el mes por cada vehículo (préstamos devueltos).
  const kmByVehicle = new Map<number, { name: string; km: number }>();
  for (const l of loans as any[]) {
    if (l.item.trackKm && l.kmOut !== null && l.kmIn !== null) {
      const entry = kmByVehicle.get(l.itemId) || { name: l.item.name, km: 0 };
      entry.km += l.kmIn - l.kmOut;
      kmByVehicle.set(l.itemId, entry);
    }
  }

  res.json({
    month: monthParam,
    inventoryValue,
    itemsCount: items.length,
    delivered: {
      loans: loans.length,
      units: deliveredUnits,
      value: round2(deliveredValue),
      byItem: Array.from(deliveredByItem.values()).map((e) => ({ ...e, value: round2(e.value) })),
    },
    purchased: {
      count: purchases.length,
      units: purchasedUnits,
      value: round2(purchasedValue),
    },
    kmByVehicle: Array.from(kmByVehicle.values()),
  });
});

export default router;
