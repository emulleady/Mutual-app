import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";

const router = Router();
router.use(requireAuth);

// Catálogo de servicios (lo ve cualquier usuario para poder asignarlos).
router.get("/types", async (_req, res) => {
  const types = await prisma.serviceType.findMany({ orderBy: { name: "asc" } });
  res.json(types);
});

const typeSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre del servicio"),
  defaultAmount: z.number().nonnegative().default(0),
  active: z.boolean().optional(),
});

// Alta de un servicio del catálogo (Configuración).
router.post("/types", requirePermission("settings.manage"), async (req: AuthenticatedRequest, res) => {
  const parsed = typeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos" });
  const exists = await prisma.serviceType.findUnique({ where: { name: parsed.data.name } });
  if (exists) return res.status(400).json({ error: "Ya existe un servicio con ese nombre" });
  const created = await prisma.serviceType.create({
    data: { name: parsed.data.name, defaultAmount: parsed.data.defaultAmount, active: parsed.data.active ?? true },
  });
  await logAudit({ userId: req.user?.id, action: "create", entityType: "service_type", entityId: created.id, afterData: created, ipAddress: req.ip });
  res.status(201).json(created);
});

// Editar nombre / costo sugerido / activar-desactivar. Cambiar el costo
// sugerido NO modifica el costo ya cargado a cada persona.
router.put("/types/:id", requirePermission("settings.manage"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = typeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos" });
  const before = await prisma.serviceType.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Servicio no encontrado" });
  if (parsed.data.name && parsed.data.name !== before.name) {
    const dup = await prisma.serviceType.findUnique({ where: { name: parsed.data.name } });
    if (dup) return res.status(400).json({ error: "Ya existe un servicio con ese nombre" });
  }
  const updated = await prisma.serviceType.update({ where: { id }, data: parsed.data });
  await logAudit({ userId: req.user?.id, action: "update", entityType: "service_type", entityId: id, beforeData: before, afterData: updated, ipAddress: req.ip });
  res.json(updated);
});

const assignSchema = z.object({
  serviceTypeId: z.number().int(),
  affiliateId: z.number().int().optional().nullable(),
  dependentId: z.number().int().optional().nullable(),
  amount: z.number().nonnegative().optional(),
});

// Asignar un servicio a una persona (titular o familiar) con su costo propio.
router.post("/assign", requirePermission("affiliates.edit"), async (req: AuthenticatedRequest, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Datos inválidos" });
  const { serviceTypeId, affiliateId, dependentId } = parsed.data;
  if (!!affiliateId === !!dependentId) {
    return res.status(400).json({ error: "Indicá el titular o el familiar (uno solo)" });
  }
  const type = await prisma.serviceType.findUnique({ where: { id: serviceTypeId } });
  if (!type || !type.active) return res.status(400).json({ error: "Servicio no disponible" });

  const dup = await prisma.personService.findFirst({
    where: { serviceTypeId, active: true, ...(dependentId ? { dependentId } : { affiliateId }) },
  });
  if (dup) return res.status(400).json({ error: "Esa persona ya tiene ese servicio" });

  const created = await prisma.personService.create({
    data: {
      serviceTypeId,
      affiliateId: dependentId ? null : affiliateId,
      dependentId: dependentId || null,
      amount: parsed.data.amount ?? type.defaultAmount,
    },
    include: { serviceType: true },
  });
  await logAudit({ userId: req.user?.id, action: "create", entityType: "person_service", entityId: created.id, afterData: created, ipAddress: req.ip });
  res.status(201).json(created);
});

// Cambiar el costo de un servicio ya asignado.
router.put("/assign/:id", requirePermission("affiliates.edit"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ amount: z.number().nonnegative() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Costo inválido" });
  const before = await prisma.personService.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "No encontrado" });
  const updated = await prisma.personService.update({ where: { id }, data: { amount: parsed.data.amount }, include: { serviceType: true } });
  await logAudit({ userId: req.user?.id, action: "update", entityType: "person_service", entityId: id, beforeData: before, afterData: updated, ipAddress: req.ip });
  res.json(updated);
});

// Quitar un servicio de una persona (queda inactivo, no se borra).
router.delete("/assign/:id", requirePermission("affiliates.edit"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const before = await prisma.personService.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "No encontrado" });
  await prisma.personService.update({ where: { id }, data: { active: false, endedAt: new Date() } });
  await logAudit({ userId: req.user?.id, action: "delete", entityType: "person_service", entityId: id, beforeData: before, ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
