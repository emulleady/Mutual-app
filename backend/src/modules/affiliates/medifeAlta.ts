import ExcelJS from "exceljs";
import { prisma } from "../../db";
import { getSmallLogoPath } from "../../shared/assets";

const MONTH_NAMES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];
const NAVY = "FF12304F";
const NAVY_SOFT = "FF1F4A74";
const SKY = "FF00B0F0";
const AMBER = "FFFFC000";
const MUTED = "FF5B7A99";
const INK = "FF1B2733";
const WHITE = "FFFFFFFF";
const LAST_COL = 9;

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin" as const, color: { argb: "FFB7C4D1" } };
const box = { top: thin, bottom: thin, left: thin, right: thin };

const isMedife = (v: string | null | undefined) => !!v && v.toLowerCase().includes("medife");

// La cobertura se carga como porcentaje (100, 60); si viene como 1 o 0,6 ya es fraccion.
function coverageFraction(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  if (isNaN(n)) return null;
  return n > 1 ? n / 100 : n;
}

// Resumen de altas de Medife del mes: los titulares que firmaron la cobertura en
// ese mes (con su familia que tiene Medife), con el modelo "ALTA OBRA SOCIAL".
export async function buildMedifeAltaWorkbook(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return null;
  const start = new Date(Date.UTC(year, idx, 1));
  const end = new Date(Date.UTC(year, idx + 1, 1));

  const titulars = await prisma.affiliate.findMany({
    where: { status: "active", medifeSignedAt: { gte: start, lt: end } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { company: true, dependents: { where: { active: true }, orderBy: { id: "asc" } } },
  });

  type Row = { number: string; name: string; dni: string; type: string; company: string; signed: Date | null; obra: string; cov: number | null; titular: boolean };
  const rows: Row[] = [];
  for (const a of titulars as any[]) {
    // El titular entra aunque su obra social figure vacia: firmo la cobertura Medife este mes.
    rows.push({
      number: a.affiliateNumber, name: `${a.lastName} ${a.firstName}`.toUpperCase(), dni: a.dni,
      type: (a.socioType || "Activo").toUpperCase(), company: a.company?.name || "",
      signed: a.medifeSignedAt, obra: "MEDIFE", cov: coverageFraction(a.coveragePercentage), titular: true,
    });
    const base = String(a.affiliateNumber).split("/")[0];
    for (const d of a.dependents) {
      if (!isMedife(d.healthProvider)) continue;
      const num = d.dependentNumber ? (String(d.dependentNumber).includes("/") ? d.dependentNumber : `${base}/${d.dependentNumber}`) : base;
      rows.push({
        number: num, name: String(d.fullName).toUpperCase(), dni: d.dni || "",
        type: (d.socioType || "Participante").toUpperCase(), company: "", signed: null,
        obra: "MEDIFE", cov: coverageFraction(d.coveragePercentage), titular: false,
      });
    }
  }

  const periodLabel = `${MONTH_NAMES[idx]} ${year}`;
  const nextLabel = `${MONTH_NAMES[(idx + 1) % 12]} ${idx === 11 ? year + 1 : year}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Mutual Trabajadores Petrolero Privado TDF";
  const ws = wb.addWorksheet("ALTA OBRA SOCIAL", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 14 }, { width: 38 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 14 }];

  const heights = [26, 20, 18, 16];
  for (let r = 1; r <= 4; r++) {
    ws.getRow(r).height = heights[r - 1];
    for (let c = 1; c <= LAST_COL; c++) ws.getCell(r, c).fill = fill(NAVY);
    ws.mergeCells(r, 2, r, LAST_COL);
  }
  const t1 = ws.getCell(1, 2);
  t1.value = "MUTUAL TRABAJADORES PETROLERO PRIVADO DE TIERRA DEL FUEGO";
  t1.font = { name: "Calibri", size: 16, bold: true, color: { argb: WHITE } };
  t1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const t2 = ws.getCell(2, 2);
  t2.value = "ALTA OBRA SOCIAL · MEDIFE";
  t2.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFB878" } };
  t2.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const t3 = ws.getCell(3, 2);
  t3.value = "Ameghino 867, Río Grande, Tierra del Fuego · Tel. 2964 42-2060";
  t3.font = { name: "Calibri", size: 10, color: { argb: "FFB9D2E8" } };
  t3.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const logo = getSmallLogoPath();
  if (logo) {
    const id = wb.addImage({ filename: logo, extension: "png" });
    ws.addImage(id, { tl: { col: 0.2, row: 0.05 }, ext: { width: 92, height: 92 } });
  }
  ws.getRow(5).height = 5.1;
  ws.getRow(6).height = 8.1;

  ws.mergeCells("A6:C7");
  const title = ws.getCell("A6");
  title.value = "ALTA OBRA SOCIAL";
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: NAVY } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(7).height = 22;
  const lab = (addr: string, text: string) => {
    const c = ws.getCell(addr);
    c.value = text; c.font = { name: "Calibri", size: 9, bold: true, color: { argb: MUTED } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  };
  const val = (addr: string, text: string) => {
    const c = ws.getCell(addr);
    c.value = text; c.font = { name: "Calibri", size: 12, bold: true, color: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: "left" };
  };
  lab("D7", "PERÍODO"); val("E7", periodLabel);
  lab("G7", "INGRESA"); val("H7", nextLabel);

  const heads = ["N.º ASOCIADO", "APELLIDO Y NOMBRE", "D.N.I.", "TIPO DE SOCIO", "EMPRESA", "FECHA DE FIRMA COBERTURA", "FECHA DE INICIO COBERTURA", "OBRA SOCIAL", "COBERTURA"];
  ws.getRow(8).height = 30;
  heads.forEach((h, i) => {
    const c = ws.getCell(8, i + 1);
    c.value = h;
    c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
    c.fill = fill(i === 8 ? SKY : NAVY_SOFT);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { ...box, bottom: { style: "medium", color: { argb: NAVY } } };
  });

  let r = 9;
  for (const row of rows) {
    ws.getRow(r).height = 18;
    const dniNum = /^\d+$/.test(row.dni) ? Number(row.dni) : row.dni;
    const vals: any[] = [row.number, row.name, dniNum, row.type, row.company, row.signed, start, row.obra, row.cov];
    vals.forEach((v, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = v;
      c.font = { name: "Calibri", size: 10, bold: row.titular, color: { argb: INK } };
      if (row.titular) c.fill = fill(AMBER);
      c.border = box;
      c.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "center" };
      if (i === 5 || i === 6) c.numFmt = "dd/mm/yyyy";
      if (i === 8) c.numFmt = "0%";
      if (i === 2 && typeof v === "number") c.numFmt = "#,##0";
    });
    r++;
  }
  if (rows.length === 0) {
    ws.mergeCells(r, 1, r, LAST_COL);
    const c = ws.getCell(r, 1);
    c.value = `No hay titulares con fecha de firma de cobertura Medife en ${periodLabel}.`;
    c.font = { name: "Calibri", size: 11, italic: true, color: { argb: MUTED } };
    c.alignment = { horizontal: "center" };
    r++;
  }

  r += 1;
  ws.mergeCells(r, 1, r + 1, LAST_COL);
  ws.getRow(r).height = 27.95; ws.getRow(r + 1).height = 27.95;
  const total = ws.getCell(r, 1);
  total.value = `TOTAL A DAR DE ALTA: ${rows.length} PERSONA(S) · ${titulars.length} TITULAR(ES)`;
  total.font = { name: "Calibri", size: 13, bold: true, color: { argb: WHITE } };
  total.fill = fill(NAVY);
  total.alignment = { vertical: "middle", horizontal: "center" };
  for (let rr = r; rr <= r + 1; rr++) for (let c = 1; c <= LAST_COL; c++) ws.getCell(rr, c).fill = fill(NAVY);

  const foot = ws.getCell(r + 2, 1);
  ws.mergeCells(r + 2, 1, r + 2, LAST_COL);
  foot.value = `Emitido el ${new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`;
  foot.font = { name: "Calibri", size: 9, color: { argb: MUTED } };
  foot.alignment = { horizontal: "right" };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, count: rows.length };
}
