import { Router } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import path from "path";
import multer from "multer";
import { prisma } from "../../db";
import { AuthenticatedRequest, requireAuth, requirePermission } from "../../middleware/auth";
import { logAudit } from "../../middleware/audit";
import { getLogoPath } from "../../shared/assets";
import { buildCompanyReport } from "./report";
import { buildCompanyMonthlyLiquidacion } from "./liquidacionMensual";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
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
        where: { status: "active" }, // la empresa solo ve (y se le liquida) a los activos
        orderBy: { lastName: "asc" },
      },
    },
  });

  if (!company) return res.status(404).json({ error: "Empresa no encontrada" });
  res.json(company);
});


// Importacion masiva de empresas desde Excel. Se reconocen las columnas por
// su titulo (Nombre/Empresa, CUIT, Domicilio, Telefono, Contacto). Si la
// empresa ya existe (mismo nombre) se completan los datos que falten; nunca
// se borra ni se desactiva nada.
function normH(h: any): string {
  return String(h ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

router.post("/import", requirePermission("companies.manage"), upload.single("file"), async (req: AuthenticatedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
    const header = (rows[0] || []).map(normH);
    const find = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const iName = find("NOMBRE", "EMPRESA", "RAZONSOCIAL", "NOMBREDELAEMPRESA");
    if (iName < 0) {
      return res.status(400).json({ error: "No se encontró la columna 'Nombre' (o 'Empresa'). Usá la plantilla." });
    }
    const iCuit = find("CUIT", "CUIL");
    const iAddr = find("DOMICILIO", "DIRECCION");
    const iPhone = find("TELEFONO", "TEL");
    const iContact = find("CONTACTO", "PERSONADECONTACTO", "NOMBREDECONTACTO", "CONTACTONOMBRE");
    const iMobile = find("CELULAR", "MOVIL", "CELULARDECONTACTO");
    // "EMAIL" suele aparecer dos veces: la primera es de la empresa y la segunda del contacto.
    const emailCols = header.map((h, i) => (["EMAIL", "CORREO", "MAIL"].includes(h) ? i : -1)).filter((i) => i >= 0);
    const iEmail = emailCols[0] ?? -1;
    const iContactEmail = emailCols[1] ?? -1;

    const txt = (v: any) => { const t = v === undefined || v === null ? "" : String(v).trim(); return t || undefined; };
    const result = { created: 0, updated: 0, errors: [] as { row: number; reason: string }[] };
    const existing = await prisma.company.findMany();
    const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every((c) => c === undefined || c === "")) continue;
      const name = txt(r[iName]);
      if (!name) { result.errors.push({ row: i + 1, reason: "Falta el nombre de la empresa" }); continue; }
      const data = {
        cuit: iCuit >= 0 ? txt(r[iCuit]) : undefined,
        address: iAddr >= 0 ? txt(r[iAddr]) : undefined,
        phone: iPhone >= 0 ? txt(r[iPhone]) : undefined,
        contactName: iContact >= 0 ? txt(r[iContact]) : undefined,
        contactMobile: iMobile >= 0 ? txt(r[iMobile]) : undefined,
        email: iEmail >= 0 ? txt(r[iEmail]) : undefined,
        contactEmail: iContactEmail >= 0 ? txt(r[iContactEmail]) : undefined,
      };
      try {
        const found = byName.get(name.toLowerCase());
        if (found) {
          await prisma.company.update({ where: { id: found.id }, data });
          result.updated++;
        } else {
          const created = await prisma.company.create({ data: { name, ...data } });
          byName.set(name.toLowerCase(), created);
          result.created++;
        }
      } catch (err: any) {
        result.errors.push({ row: i + 1, reason: `No se pudo guardar: ${err.message || err}` });
      }
    }

    await logAudit({ userId: req.user?.id, action: "create", entityType: "company", afterData: result, ipAddress: req.ip });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `No se pudo procesar el archivo: ${err.message || err}` });
  }
});

const companySchema = z.object({
  name: z.string().min(1),
  cuit: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  contactEmail: z.string().optional().nullable(),
  contactMobile: z.string().optional().nullable(),
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

// Liquidación mensual para la empresa: cuotas de órdenes de compra que
// vencen en el mes elegido (?month=AAAA-MM) y siguen impagas.
router.get("/:id/liquidacion", async (req, res) => {
  const id = Number(req.params.id);
  const month = String(req.query.month || "");
  const result = await buildCompanyMonthlyLiquidacion(id, month);
  if (!result) return res.status(400).json({ error: "Empresa no encontrada o mes inválido (usar AAAA-MM)" });

  const fileName = `liquidacion-${result.companyName.replace(/[^a-zA-Z0-9]/g, "_")}-${month}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(result.buffer);
});

router.get("/:id/report/excel", async (req, res) => {
  const id = Number(req.params.id);
  const report = await buildCompanyReport(id);
  if (!report) return res.status(404).json({ error: "Empresa no encontrada" });

  const sheetData = report.rows.map((r) => ({
    "N° Asociado": r.affiliateNumber,
    "Apellido y Nombre": r.fullName,
    DNI: r.dni,
    Parentesco: r.parentesco,
    Estado: r.status,
    "Obra Social": r.healthProvider,
    "% Cobertura": r.coveragePercentage,
    "Deuda total": r.parentesco === "Titular" ? r.totalDebt : "",
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
  const logoPath = getLogoPath();
  if (logoPath) {
    try {
      doc.image(logoPath, 40, 30, { width: 50 });
    } catch {
      // Si falla al dibujarlo, se sigue sin él.
    }
  }
  doc
    .fontSize(14)
    .text("Mutual Petrolero Privado", 100, 35)
    .fontSize(9)
    .fillColor("#555555")
    .text("Ameghino 867, Río Grande, Tierra del Fuego — Tel: 2964 42-2060", 100, 55)
    .fillColor("#000000");

  doc.moveDown(3);
  doc.fontSize(12).text(`Estado de asociados — ${report.companyName}`, { underline: true });
  doc.fontSize(9).fillColor("#555555").text(`Generado el ${report.generatedAt.toLocaleDateString("es-AR")}`);
  doc.fillColor("#000000").moveDown(1);

  // Encabezado de tabla.
  const startX = 40;
  let y = doc.y;
  const colWidths = [60, 130, 65, 60, 55, 90, 55];
  const headers = ["N° Asociado", "Apellido y Nombre", "DNI", "Parentesco", "Estado", "Obra Social", "Deuda total"];

  doc.fontSize(8).font("Helvetica-Bold");
  headers.forEach((h, i) => {
    const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.text(h, x, y, { width: colWidths[i] });
  });
  doc.font("Helvetica");
  y += 14;
  doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).strokeColor("#cccccc").stroke();
  y += 6;

  for (const row of report.rows) {
    if (y > 760) {
      doc.addPage();
      y = 40;
    }
    const isTitular = row.parentesco === "Titular";
    const values = [
      row.affiliateNumber,
      row.fullName,
      row.dni,
      row.parentesco,
      row.status,
      row.healthProvider,
      isTitular ? `$${row.totalDebt.toLocaleString("es-AR")}` : "",
    ];
    if (isTitular) doc.font("Helvetica-Bold");
    values.forEach((v, i) => {
      const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.fontSize(8).text(v, x, y, { width: colWidths[i] });
    });
    if (isTitular) doc.font("Helvetica");
    y += 16;
  }

  doc.end();
});

export default router;
