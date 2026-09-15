import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";

const router = Router();
router.use(requireAuth);
router.use(requirePermission("users.manage"));

// Listado de usuarios internos (sin exponer el hash de la contraseña).
router.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { role: true, branch: true },
    orderBy: { username: "asc" },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role.name,
      roleId: u.roleId,
      branch: u.branch?.name ?? null,
      active: u.active,
    }))
  );
});

router.get("/roles", async (_req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  res.json(roles);
});

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  fullName: z.string().min(1),
  roleId: z.number(),
  branchId: z.number().optional().nullable(),
});

// Alta de un usuario interno (secretario o administrador).
router.post("/", async (req: AuthenticatedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;
  const existing = await prisma.user.findUnique({ where: { username: data.username } });
  if (existing) return res.status(400).json({ error: "Ese nombre de usuario ya existe" });

  const passwordHash = await bcrypt.hash(data.password, 10);
  const created = await prisma.user.create({
    data: {
      username: data.username,
      passwordHash,
      fullName: data.fullName,
      roleId: data.roleId,
      branchId: data.branchId ?? null,
    },
  });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "user",
    entityId: created.id,
    afterData: { username: created.username, fullName: created.fullName, roleId: created.roleId },
    ipAddress: req.ip,
  });

  res.status(201).json({ id: created.id, username: created.username });
});

// Activar/desactivar (nunca se borra un usuario, para no perder la
// referencia de auditoria de lo que hizo).
router.post("/:id/toggle-active", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  if (user.id === req.user?.id) {
    return res.status(400).json({ error: "No podés desactivar tu propio usuario" });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { active: !user.active },
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "user",
    entityId: id,
    beforeData: { active: user.active },
    afterData: { active: updated.active },
    ipAddress: req.ip,
  });

  res.json({ id: updated.id, active: updated.active });
});

// Restablecer contraseña de un usuario (lo hace el administrador).
const resetSchema = z.object({ password: z.string().min(8) });

router.post("/:id/reset-password", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "user",
    entityId: id,
    afterData: { passwordReset: true },
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

export default router;
