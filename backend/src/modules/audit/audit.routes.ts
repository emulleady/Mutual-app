import { Router } from "express";
import { prisma } from "../../db";
import { requireAuth, requirePermission } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);
router.use(requirePermission("audit.view"));

// Auditoria de solo lectura: esta tabla nunca se edita ni se borra desde
// ningun endpoint (ni siquiera este), asi que no hay riesgo de que el
// administrador altere el rastro de lo que hizo cada usuario.
router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 50;

  const userId = req.query.userId ? Number(req.query.userId) : undefined;
  const entityType = (req.query.entityType as string) || undefined;
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

  const where: any = {};
  if (userId) where.userId = userId;
  if (entityType) where.entityType = entityType;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = dateFrom;
    if (dateTo) where.createdAt.lte = dateTo;
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({
    total,
    page,
    pageSize,
    logs: logs.map((l) => ({
      id: l.id,
      userName: l.user?.username ?? "(sistema)",
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      beforeData: l.beforeData ? JSON.parse(l.beforeData) : null,
      afterData: l.afterData ? JSON.parse(l.afterData) : null,
      ipAddress: l.ipAddress,
      createdAt: l.createdAt,
    })),
  });
});

// Lista de tipos de entidad distintos, para armar el filtro en el frontend.
router.get("/entity-types", async (_req, res) => {
  const rows = await prisma.auditLog.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
  });
  res.json(rows.map((r) => r.entityType));
});

export default router;
