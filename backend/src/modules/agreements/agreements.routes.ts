import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";

const router = Router();
router.use(requireAuth);

// Convenios con Empresas y con Comercios, cada uno por separado via
// "kind". Cualquier usuario autenticado puede listarlos (por ejemplo,
// para consultar las condiciones de un convenio), pero solo el
// administrador puede crearlos o modificarlos.
router.get("/", async (req, res) => {
  const kind = req.query.kind as string | undefined;
  const agreements = await prisma.agreement.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { name: "asc" },
  });
  res.json(agreements);
});

const agreementSchema = z.object({
  kind: z.enum(["empresa", "comercio"]),
  name: z.string().min(1),
  details: z.string().optional().nullable(),
});

router.post("/", requirePermission("agreements.manage"), async (req: AuthenticatedRequest, res) => {
  const parsed = agreementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = await prisma.agreement.create({
    data: { ...parsed.data, createdByUserId: req.user?.id },
  });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "agreement",
    entityId: created.id,
    afterData: created,
    ipAddress: req.ip,
  });

  res.status(201).json(created);
});

router.put("/:id", requirePermission("agreements.manage"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = agreementSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const before = await prisma.agreement.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Convenio no encontrado" });

  const updated = await prisma.agreement.update({ where: { id }, data: parsed.data });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "agreement",
    entityId: id,
    beforeData: before,
    afterData: updated,
    ipAddress: req.ip,
  });

  res.json(updated);
});

// Baja logica: nunca se borra un convenio, solo se desactiva.
router.post("/:id/toggle-active", requirePermission("agreements.manage"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const agreement = await prisma.agreement.findUnique({ where: { id } });
  if (!agreement) return res.status(404).json({ error: "Convenio no encontrado" });

  const updated = await prisma.agreement.update({
    where: { id },
    data: { active: !agreement.active },
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "agreement",
    entityId: id,
    beforeData: { active: agreement.active },
    afterData: { active: updated.active },
    ipAddress: req.ip,
  });

  res.json(updated);
});

export default router;
