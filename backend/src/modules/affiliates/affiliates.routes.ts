import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit, logAffiliateEvent } from "../../middleware/audit";
import { importAffiliatesFromExcel } from "./import";
import { generateFichaAltaPdf, generateFichaFamiliaresPdf } from "./forms";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth);

const affiliateSchema = z.object({
  affiliateNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dni: z.string().min(1),
  cuil: z.string().optional().nullable(),
  birthDate: z.string().datetime().optional().nullable(),
  address: z.string().optional().nullable(),
  addressNumber: z.string().optional().nullable(),
  addressType: z.string().optional().nullable(),
  floorApt: z.string().optional().nullable(),
  locality: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  branchId: z.number().optional().nullable(),
  companyId: z.number().optional().nullable(),
  yacimiento: z.string().optional().nullable(),
  puesto: z.string().optional().nullable(),
  healthProvider: z.string().optional().nullable(),
  coveragePercentage: z.string().optional().nullable(),
  socioType: z.string().optional().nullable(),
});

// Buscador global: por DNI, numero de afiliado, nombre, apellido,
// telefono o email (punto 12 del brief).
router.get("/search", async (req, res) => {
  const q = (req.query.q as string) || "";
  if (q.trim().length === 0) {
    return res.json([]);
  }

  const results = await prisma.affiliate.findMany({
    where: {
      OR: [
        { dni: { contains: q } },
        { affiliateNumber: { contains: q } },
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
      ],
    },
    take: 20,
    orderBy: { lastName: "asc" },
  });

  res.json(results);
});

// Listado general (con filtro simple por estado).
router.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  const affiliates = await prisma.affiliate.findMany({
    where: status ? { status } : undefined,
    orderBy: { lastName: "asc" },
  });
  res.json(affiliates);
});

// Ficha del afiliado: datos + linea de tiempo de eventos.
// (Prestamos/servicios/beneficios se suman en etapas siguientes.)
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const affiliate = await prisma.affiliate.findUnique({
    where: { id },
    include: {
      events: { orderBy: { occurredAt: "desc" } },
      branch: true,
      company: true,
      dependents: { orderBy: { fullName: "asc" } },
    },
  });

  if (!affiliate) {
    return res.status(404).json({ error: "Afiliado no encontrado" });
  }

  res.json(affiliate);
});

router.post("/", requirePermission("affiliates.create"), async (req: AuthenticatedRequest, res) => {
  const parsed = affiliateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const data = parsed.data;
  const created = await prisma.affiliate.create({
    data: {
      affiliateNumber: data.affiliateNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      dni: data.dni,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      address: data.address ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      branchId: data.branchId ?? null,
      companyId: data.companyId ?? null,
    },
  });

  await logAffiliateEvent({
    affiliateId: created.id,
    eventType: "affiliate_created",
    description: `Alta de afiliado ${created.firstName} ${created.lastName}`,
    createdByUserId: req.user?.id,
  });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "affiliate",
    entityId: created.id,
    afterData: created,
    ipAddress: req.ip,
  });

  res.status(201).json(created);
});

router.put("/:id", requirePermission("affiliates.edit"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = affiliateSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const before = await prisma.affiliate.findUnique({ where: { id } });
  if (!before) {
    return res.status(404).json({ error: "Afiliado no encontrado" });
  }

  const data = parsed.data;
  const updated = await prisma.affiliate.update({
    where: { id },
    data: {
      ...data,
      birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
    },
  });

  await logAffiliateEvent({
    affiliateId: id,
    eventType: "data_modified",
    description: "Se modificaron datos del afiliado",
    createdByUserId: req.user?.id,
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "affiliate",
    entityId: id,
    beforeData: before,
    afterData: updated,
    ipAddress: req.ip,
  });

  res.json(updated);
});

// Baja logica: nunca se borra el registro, solo cambia el estado
// (consistente con "nada se borra" del diseño).
router.post("/:id/deactivate", requirePermission("affiliates.deactivate"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const before = await prisma.affiliate.findUnique({ where: { id } });
  if (!before) {
    return res.status(404).json({ error: "Afiliado no encontrado" });
  }

  const updated = await prisma.affiliate.update({
    where: { id },
    data: { status: "inactive" },
  });

  await logAffiliateEvent({
    affiliateId: id,
    eventType: "affiliate_deactivated",
    description: "Afiliado dado de baja",
    createdByUserId: req.user?.id,
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "affiliate",
    entityId: id,
    beforeData: before,
    afterData: updated,
    ipAddress: req.ip,
  });

  res.json(updated);
});

// Reactivar un afiliado dado de baja (misma logica inversa: cambia
// status, nunca se toca ningun otro dato).
router.post("/:id/activate", requirePermission("affiliates.deactivate"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const before = await prisma.affiliate.findUnique({ where: { id } });
  if (!before) {
    return res.status(404).json({ error: "Afiliado no encontrado" });
  }

  const updated = await prisma.affiliate.update({
    where: { id },
    data: { status: "active" },
  });

  await logAffiliateEvent({
    affiliateId: id,
    eventType: "affiliate_reactivated",
    description: "Afiliado reactivado",
    createdByUserId: req.user?.id,
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "affiliate",
    entityId: id,
    beforeData: before,
    afterData: updated,
    ipAddress: req.ip,
  });

  res.json(updated);
});

// Importacion masiva desde la planilla Excel de la mutual. Valida fila por
// fila: lo que tiene error se informa y se salta, y lo valido se importa
// igual (no se cancela todo por unas pocas filas con problemas).
router.post(
  "/import",
  requirePermission("affiliates.create"),
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ningún archivo" });
    }

    try {
      const result = await importAffiliatesFromExcel(req.file.buffer, req.user?.id);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: `No se pudo procesar el archivo: ${err.message || err}` });
    }
  }
);

// Familiares a cargo de un afiliado (para la pestaña correspondiente en la ficha).
router.get("/:id/dependents", async (req, res) => {
  const affiliateId = Number(req.params.id);
  const dependents = await prisma.dependent.findMany({
    where: { affiliateId },
    orderBy: { fullName: "asc" },
  });
  res.json(dependents);
});

const dependentSchema = z.object({
  fullName: z.string().min(1),
  dni: z.string().optional().nullable(),
  cuil: z.string().optional().nullable(),
  dependentNumber: z.string().optional().nullable(),
  parentesco: z.string().min(1),
  birthDate: z.string().datetime().optional().nullable(),
  healthProvider: z.string().optional().nullable(),
  coveragePercentage: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  addressNumber: z.string().optional().nullable(),
  addressType: z.string().optional().nullable(),
  floorApt: z.string().optional().nullable(),
  locality: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
});

// Alta manual de un familiar a cargo (ademas de los que vienen por la
// importacion de Excel).
router.post("/:id/dependents", requirePermission("affiliates.edit"), async (req: AuthenticatedRequest, res) => {
  const affiliateId = Number(req.params.id);
  const parsed = dependentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate) return res.status(404).json({ error: "Afiliado no encontrado" });

  const data = parsed.data;
  const created = await prisma.dependent.create({
    data: {
      affiliateId,
      fullName: data.fullName,
      dni: data.dni ?? null,
      cuil: data.cuil ?? null,
      dependentNumber: data.dependentNumber ?? null,
      parentesco: data.parentesco,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      healthProvider: data.healthProvider ?? null,
      coveragePercentage: data.coveragePercentage ?? null,
      address: data.address ?? null,
      addressNumber: data.addressNumber ?? null,
      addressType: data.addressType ?? null,
      floorApt: data.floorApt ?? null,
      locality: data.locality ?? null,
      province: data.province ?? null,
      phone: data.phone ?? null,
      email: data.email || null,
    },
  });

  await logAffiliateEvent({
    affiliateId,
    eventType: "dependent_added",
    description: `Se agregó a ${created.fullName} (${created.parentesco}) como familiar a cargo`,
    referenceTable: "dependents",
    referenceId: created.id,
    createdByUserId: req.user?.id,
  });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "dependent",
    entityId: created.id,
    afterData: created,
    ipAddress: req.ip,
  });

  res.status(201).json(created);
});

// Descarga de las fichas en PDF, con los datos ya cargados en el sistema.
router.get("/:id/forms/alta", async (req, res) => {
  const id = Number(req.params.id);
  const affiliate = await prisma.affiliate.findUnique({
    where: { id },
    include: { company: true },
  });
  if (!affiliate) return res.status(404).json({ error: "Afiliado no encontrado" });
  generateFichaAltaPdf(res, affiliate);
});

router.get("/:id/forms/familiares", async (req, res) => {
  const id = Number(req.params.id);
  const affiliate = await prisma.affiliate.findUnique({ where: { id } });
  if (!affiliate) return res.status(404).json({ error: "Afiliado no encontrado" });

  const dependents = await prisma.dependent.findMany({
    where: { affiliateId: id },
    orderBy: { fullName: "asc" },
  });
  generateFichaFamiliaresPdf(res, affiliate, dependents);
});

export default router;
