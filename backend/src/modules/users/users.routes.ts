import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";
import { ensurePermissionsExist } from "./permissionCatalog";

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

// Roles del sistema: "Administrador" tiene siempre acceso total y no se
// puede modificar ni borrar; "Secretario" se puede ajustar pero no borrar
// ni renombrar. Cualquier otro rol lo crea y administra el Administrador.
const ADMIN_ROLE = "Administrador";
const SYSTEM_ROLES = [ADMIN_ROLE, "Secretario"];

// Listado de roles con sus permisos y cuantos usuarios lo usan.
router.get("/roles", async (_req, res) => {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
  });
  res.json(
    roles.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: SYSTEM_ROLES.includes(r.name),
      isAdmin: r.name === ADMIN_ROLE,
      userCount: r._count.users,
      permissionKeys: r.permissions.map((rp: any) => rp.permission.key),
    }))
  );
});

// Catalogo de todos los permisos que existen en el sistema.
router.get("/permissions", async (_req, res) => {
  await ensurePermissionsExist();
  const permissions = await prisma.permission.findMany({ orderBy: { key: "asc" } });
  res.json(permissions.map((p: any) => p.key));
});

const roleSchema = z.object({
  name: z.string().trim().min(2, "El nombre del rol debe tener al menos 2 letras"),
  description: z.string().trim().optional().nullable(),
  permissionKeys: z.array(z.string()),
});

// Crear un rol nuevo, con los permisos que se tildaron.
router.post("/roles", async (req: AuthenticatedRequest, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const existing = await prisma.role.findUnique({ where: { name: data.name } });
  if (existing) return res.status(400).json({ error: "Ya existe un rol con ese nombre" });

  await ensurePermissionsExist();
  const permissions = await prisma.permission.findMany({
    where: { key: { in: data.permissionKeys } },
  });

  const created = await prisma.role.create({
    data: {
      name: data.name,
      description: data.description || null,
      permissions: { create: permissions.map((p: any) => ({ permissionId: p.id })) },
    },
  });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "role",
    entityId: created.id,
    afterData: { name: created.name, permissionKeys: permissions.map((p: any) => p.key) },
    ipAddress: req.ip,
  });

  res.status(201).json({ id: created.id, name: created.name });
});

// Editar un rol: nombre, descripcion y permisos (reemplaza el conjunto).
router.put("/roles/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const role = await prisma.role.findUnique({
    where: { id },
    include: { permissions: { include: { permission: true } } },
  });
  if (!role) return res.status(404).json({ error: "Rol no encontrado" });

  if (role.name === ADMIN_ROLE) {
    return res.status(400).json({ error: "El rol Administrador tiene acceso total y no se puede modificar" });
  }
  if (SYSTEM_ROLES.includes(role.name) && data.name !== role.name) {
    return res.status(400).json({ error: `El rol ${role.name} no se puede renombrar` });
  }
  if (data.name !== role.name) {
    const clash = await prisma.role.findUnique({ where: { name: data.name } });
    if (clash) return res.status(400).json({ error: "Ya existe un rol con ese nombre" });
  }

  await ensurePermissionsExist();
  const permissions = await prisma.permission.findMany({
    where: { key: { in: data.permissionKeys } },
  });

  const beforeKeys = role.permissions.map((rp: any) => rp.permission.key);

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.rolePermission.createMany({
      data: permissions.map((p: any) => ({ roleId: id, permissionId: p.id })),
    }),
    prisma.role.update({
      where: { id },
      data: { name: data.name, description: data.description || null },
    }),
  ]);

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "role",
    entityId: id,
    beforeData: { name: role.name, permissionKeys: beforeKeys },
    afterData: { name: data.name, permissionKeys: permissions.map((p: any) => p.key) },
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

// Borrar un rol: solo si es uno creado a mano y no tiene usuarios.
router.delete("/roles/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return res.status(404).json({ error: "Rol no encontrado" });

  if (SYSTEM_ROLES.includes(role.name)) {
    return res.status(400).json({ error: `El rol ${role.name} es del sistema y no se puede borrar` });
  }
  if (role._count.users > 0) {
    return res.status(400).json({
      error: `No se puede borrar: ${role._count.users} usuario(s) todavía tienen este rol. Cambiales el rol primero.`,
    });
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);

  await logAudit({
    userId: req.user?.id,
    action: "delete",
    entityType: "role",
    entityId: id,
    beforeData: { name: role.name },
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

// Cambiar el rol de un usuario existente.
router.post("/:id/role", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ roleId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (id === req.user?.id) {
    return res.status(400).json({ error: "No podés cambiar tu propio rol" });
  }

  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id }, include: { role: true } }),
    prisma.role.findUnique({ where: { id: parsed.data.roleId } }),
  ]);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (!role) return res.status(404).json({ error: "Rol no encontrado" });

  await prisma.user.update({ where: { id }, data: { roleId: role.id } });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "user",
    entityId: id,
    beforeData: { role: user.role.name },
    afterData: { role: role.name },
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

// Todos los permisos del sistema, marcando para este usuario puntual
// cuáles le da su rol y cuáles tiene otorgados directamente (además).
router.get("/:id/permissions", async (req, res) => {
  const id = Number(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  await ensurePermissionsExist();
  const [allPermissions, rolePerms, userPerms] = await Promise.all([
    prisma.permission.findMany({ orderBy: { key: "asc" } }),
    prisma.rolePermission.findMany({ where: { roleId: user.roleId } }),
    prisma.userPermission.findMany({ where: { userId: id } }),
  ]);

  const rolePermIds = new Set(rolePerms.map((p) => p.permissionId));
  const userPermIds = new Set(userPerms.map((p) => p.permissionId));

  res.json(
    allPermissions.map((p) => ({
      key: p.key,
      fromRole: rolePermIds.has(p.id),
      fromUser: userPermIds.has(p.id),
    }))
  );
});

const setPermissionsSchema = z.object({ permissionKeys: z.array(z.string()) });

// Reemplaza por completo los permisos otorgados DIRECTAMENTE a este
// usuario (los del rol no se tocan acá, siguen aplicando igual).
router.post("/:id/permissions", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = setPermissionsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const permissions = await prisma.permission.findMany({
    where: { key: { in: parsed.data.permissionKeys } },
  });

  await prisma.userPermission.deleteMany({ where: { userId: id } });
  await prisma.userPermission.createMany({
    data: permissions.map((p) => ({ userId: id, permissionId: p.id })),
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "user_permissions",
    entityId: id,
    afterData: { permissionKeys: parsed.data.permissionKeys },
    ipAddress: req.ip,
  });

  res.json({ ok: true });
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
