import { Router } from "express";
import { prisma } from "../../db";
import { requireAuth, requirePermission } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
const isBaja = (s: string | null | undefined) => norm(s).includes("baja");

// Consulta de Farmacia: dado un DNI, N° de asociado o nombre, devuelve el
// titular y sus familiares con su estado (activo / baja) y el descuento en
// medicamentos y en productos de farmacia segun su tipo de socio. Es de solo
// lectura y no expone deuda, ordenes ni otros datos.
router.get("/lookup", requirePermission("pharmacy.view"), async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 3) return res.json([]);

  const [discounts, affiliates] = await Promise.all([
    prisma.pharmacyDiscountSetting.findMany(),
    prisma.affiliate.findMany({
      where: {
        // Cada palabra puede estar en cualquier dato: "romero hector" o "romero, hector".
        AND: q.replace(/[,;]/g, " ").split(/\s+/).filter(Boolean).map((w) => ({
          OR: [
            { dni: { contains: w } },
            { affiliateNumber: { contains: w } },
            { firstName: { contains: w, mode: "insensitive" as const } },
            { lastName: { contains: w, mode: "insensitive" as const } },
            { dependents: { some: { OR: [{ dni: { contains: w } }, { fullName: { contains: w, mode: "insensitive" as const } }] } } },
          ],
        })),
      },
      take: 15,
      orderBy: { lastName: "asc" },
      include: { company: true, dependents: { orderBy: { id: "asc" } } },
    }),
  ]);

  const byType = new Map(discounts.map((d: any) => [norm(d.socioType), d]));
  const discountFor = (type: string | null | undefined) => {
    const d: any = byType.get(norm(type));
    return d ? { medicines: d.medicinesPct, products: d.productsPct } : null;
  };

  res.json(
    affiliates.map((a: any) => {
      const titularActive = a.status === "active" && !isBaja(a.registryStatus);
      const titularType = a.socioType || "Activo";
      return {
        id: a.id,
        affiliateNumber: a.affiliateNumber,
        name: `${a.lastName} ${a.firstName}`,
        dni: a.dni,
        socioType: titularType,
        company: a.company?.name || null,
        healthProvider: a.healthProvider || null,
        coverage: a.coveragePercentage ?? null,
        active: titularActive,
        discount: titularActive ? discountFor(titularType) : null,
        dependents: a.dependents.map((d: any) => {
          // Un familiar "Participante" sin mas detalle toma la categoria del titular
          // (Participante Activo / Participante Adherente), igual que la cuota social.
          let type: string = d.socioType || "Participante";
          if (norm(type) === "participante") type = `Participante ${titularType}`;
          const active = titularActive && d.active && !isBaja(d.registryStatus);
          return {
            id: d.id,
            name: d.fullName,
            dni: d.dni,
            parentesco: d.parentesco,
            socioType: type,
            healthProvider: d.healthProvider || null,
            coverage: d.coveragePercentage ?? null,
            active,
            discount: active ? discountFor(type) : null,
          };
        }),
      };
    })
  );
});

export default router;
