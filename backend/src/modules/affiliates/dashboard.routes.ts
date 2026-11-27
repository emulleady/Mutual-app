import { Router } from "express";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

// Indicadores generales del dashboard (punto 3 del brief).
// En etapas siguientes se suman los indicadores de prestamos/servicios/beneficios.
router.get("/", async (req: AuthenticatedRequest, res) => {
  // El Resumen lo ven solo los administradores.
  if (req.user?.roleName !== "Administrador") {
    return res.status(403).json({ error: "El resumen es solo para administradores" });
  }
  const [totalAffiliates, activeAffiliates, inactiveAffiliates] = await Promise.all([
    prisma.affiliate.count(),
    prisma.affiliate.count({ where: { status: "active" } }),
    prisma.affiliate.count({ where: { status: "inactive" } }),
  ]);

  const recentEvents = await prisma.affiliateEvent.findMany({
    take: 10,
    orderBy: { occurredAt: "desc" },
    include: { affiliate: true },
  });

  res.json({
    totalAffiliates,
    activeAffiliates,
    inactiveAffiliates,
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      description: e.description,
      occurredAt: e.occurredAt,
      affiliateName: `${e.affiliate.firstName} ${e.affiliate.lastName}`,
    })),
  });
});

export default router;
