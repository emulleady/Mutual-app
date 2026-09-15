import { Router } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import path from "path";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";
import { buildCompanyReport } from "./report";

const router = Router();
router.use(requireAuth);

// Cualquier usuario autenticado puede listar (se necesita para elegir la
// empresa al cargar/editar un afiliado), pero solo el administrador puede
// crear o modificar empresas.
router.get("/", async (_req, res) => {
  const companies = await prisma.company.findMany({ orderBy: { name: "asc" } });
  res.json(companies);
});

// Detalle de una empresa con los afiliados que trabajan ahi (para el
// descuento por recibo de sueldo). En Etapa 3 tambien va a listar los
// beneficios en los que esta empresa figura como proveedor.
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      affiliates: {
        orderBy: { lastName: "asc" },
      },
    },
  });

  if (!company) return res.status(404).json({ error: "Empresa no encontrada" });
  res.json(company);
});

const companySchema = z.object({
  name: z.string().min(1),
  cuit: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
});

router.post("/", requirePermission("companies.manage"), async (req: AuthenticatedRequest, res) => {
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = await prisma.company.create({ data: parsed.data });

  await logAudit({
    userId: req.user?.id,
    action: "create",
    entityType: "company",
    entityId: created.id,
    afterData: created,
    ipAddress: req.ip,
  });

  res.status(201).json(created);
});

router.put("/:id", requirePermission("companies.manage"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = companySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const before = await prisma.company.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "Empresa no encontrada" });

  const updated = await prisma.company.update({ where: { id }, data: parsed.data });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "company",
    entityId: id,
    beforeData: before,
    afterData: updated,
    ipAddress: req.ip,
  });

  res.json(updated);
});

// Baja logica: nunca se borra, solo se desactiva (para no perder la
// referencia de los afiliados que la tienen cargada como empleador).
router.post("/:id/toggle-active", requirePermission("companies.manage"), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return res.status(404).json({ error: "Empresa no encontrada" });

  const updated = await prisma.company.update({
    where: { id },
    data: { active: !company.active },
  });

  await logAudit({
    userId: req.user?.id,
    action: "update",
    entityType: "company",
    entityId: id,
    beforeData: { active: company.active },
    afterData: { active: updated.active },
    ipAddress: req.ip,
  });

  res.json(updated);
});

// Reporte para enviarle a la empresa: estado y deuda total de cada
// afiliado que trabaja ahí. Cualquier usuario autenticado puede
// descargarlo (lo usan los secretarios, no solo el administrador).

router.get("/:id/report/excel", async (req, res) => {
  const id = Number(req.params.id);
  const report = await buildCompanyReport(id);
  if (!report) return res.status(404).json({ error: "Empresa no encontrada" });

  const sheetData = report.rows.map((r) => ({
    "N° Asociado": r.affiliateNumber,
    "Apellido y Nombre": r.fullName,
    DNI: r.dni,
    Estado: r.status,
    "Deuda total": r.totalDebt,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Afiliados");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const fileName = `estado-afiliados-${report.companyName.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(buffer);
});

router.get("/:id/report/pdf", async (req, res) => {
  const id = Number(req.params.id);
  const report = await buildCompanyReport(id);
  if (!report) return res.status(404).json({ error: "Empresa no encontrada" });

  const fileName = `estado-afiliados-${report.companyName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  // Membrete.
  const logoPath = path.join(__dirname, "..", "..", "assets", "logo.png");
  try {
    doc.image(logoPath, 40, 30, { width: 50 });
  } catch {
    // Si el logo no está disponible, se sigue sin él.
  }
  doc
    .fontSize(14)
    .text("Mutual Petrolero Privado", 100, 35)
    .fontSize(9)
    .fillColor("#555555")
    .text("Ameghino 867, Río Grande, Tierra del Fuego — Tel: 2964 42-2060", 100, 55)
    .fillColor("#000000");

  doc.moveDown(3);
  doc.fontSize(12).text(`Estado de afiliados — ${report.companyName}`, { underline: true });
  doc.fontSize(9).fillColor("#555555").text(`Generado el ${report.generatedAt.toLocaleDateString("es-AR")}`);
  doc.fillColor("#000000").moveDown(1);

  // Encabezado de tabla.
  const startX = 40;
  let y = doc.y;
  const colWidths = [70, 180, 80, 80, 90];
  const headers = ["N° Asociado", "Apellido y Nombre", "DNI", "Estado", "Deuda total"];

  doc.fontSize(9).font("Helvetica-Bold");
  headers.forEach((h, i) => {
    const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.text(h, x, y, { width: colWidths[i] });
  });
  doc.font("Helvetica");
  y += 16;
  doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).strokeColor("#cccccc").stroke();
  y += 6;

  for (const row of report.rows) {
    if (y > 760) {
      doc.addPage();
      y = 40;
    }
    const values = [
      row.affiliateNumber,
      row.fullName,
      row.dni,
      row.status,
      `$${row.totalDebt.toLocaleString("es-AR")}`,
    ];
    values.forEach((v, i) => {
      const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(v, x, y, { width: colWidths[i] });
    });
    y += 18;
  }

  doc.end();
});

export default router;
