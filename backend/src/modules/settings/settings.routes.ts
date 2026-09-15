import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";

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

export default router;
