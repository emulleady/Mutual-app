import ExcelJS from "exceljs";
import { prisma } from "../../db";
import { getSmallLogoPath } from "../../shared/assets";

const MONTH_NAMES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

// Argentina es UTC-3: el mes se corta a medianoche hora argentina, para que
// una cuota que vence "el 1 de mes" caiga en el mes que ve el usuario.
const AR_OFFSET_HOURS = 3;

// Colores tomados del logo de la mutual (azul profundo + naranja del aro).
const NAVY = "FF12304F";
const NAVY_SOFT = "FF1F4A74";
const ORANGE = "FFE8731A";
const ORANGE_SOFT = "FFFDE8D3";
const SKY_SOFT = "FFEAF3FB";
const WHITE = "FFFFFFFF";
const INK = "FF1B2733";
const MUTED = "FFB9D2E8";

const MONEY_FORMAT = '"$" #,##0.00';
const DATE_FORMAT = "dd/mm/yyyy";
const LAST_COL = 9; // columnas A..I

export function parseMonth(month: string): { start: Date; end: Date; year: number; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1, AR_OFFSET_HOURS, 0, 0)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1, AR_OFFSET_HOURS, 0, 0)),
    year,
    monthIndex,
  };
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const thin = (argb: string): Partial<ExcelJS.Border> => ({ style: "thin", color: { argb } });

// Liquidación mensual para enviarle a la empresa: las cuotas de órdenes de
// compra que vencen en el mes elegido y todavía están impagas, de los
// asociados activos de esa empresa. Sin mora (la empresa descuenta la cuota
// tal cual del recibo de haberes).
export async function buildCompanyMonthlyLiquidacion(
  companyId: number,
  month: string
): Promise<{ buffer: Buffer; companyName: string; empty: boolean } | null> {
  const range = parseMonth(month);
  if (!range) return null;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  const affiliates = await prisma.affiliate.findMany({
    where: { companyId, status: "active" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      loans: {
        where: { status: { in: ["active", "overdue", "pending", "approved"] } },
        orderBy: { grantedAt: "asc" },
        include: {
          installments: {
            where: { status: { not: "paid" }, dueDate: { gte: range.start, lt: range.end } },
            orderBy: { number: "asc" },
          },
        },
      },
    },
  });

  // --- Datos: una "persona" con sus cuotas del mes ---
  type Line = { fecha: Date; orden: string; cuota: string; vence: Date; monto: number };
  const people: { number: string; name: string; dni: string; subtotal: number; lines: Line[] }[] = [];

  for (const a of affiliates) {
    const lines: Line[] = [];
    for (const loan of a.loans) {
      for (const inst of loan.installments) {
        lines.push({
          fecha: loan.grantedAt,
          orden: loan.orderNumber || String(loan.id),
          cuota: `${inst.number}/${loan.installmentsCount}`,
          vence: inst.dueDate,
          // Si la cuota ya tuvo un pago parcial, se pide solo lo que falta.
          monto: Number((inst.amount - inst.paidAmount).toFixed(2)),
        });
      }
    }
    if (lines.length === 0) continue;
    people.push({
      number: a.affiliateNumber,
      name: `${a.lastName}, ${a.firstName}`.toUpperCase(),
      dni: a.dni,
      subtotal: Number(lines.reduce((sum, l) => sum + l.monto, 0).toFixed(2)),
      lines,
    });
  }

  const grandTotal = Number(people.reduce((sum, p) => sum + p.subtotal, 0).toFixed(2));
  const installmentsCount = people.reduce((sum, p) => sum + p.lines.length, 0);
  const periodLabel = `${MONTH_NAMES[range.monthIndex]} ${range.year}`;

  // --- Planilla ---
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mutual Trabajadores Petrolero Privado de Tierra del Fuego";
  const ws = workbook.addWorksheet("LIQUIDACION", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 8 }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
      printTitlesRow: "8:8",
    },
    headerFooter: { oddFooter: "&LMutual Trabajadores Petrolero Privado TDF&RPágina &P de &N" },
  });

  ws.columns = [
    { width: 14 }, { width: 34 }, { width: 13 }, { width: 13 }, { width: 16 },
    { width: 9 }, { width: 14 }, { width: 16 }, { width: 22 },
  ];

  // Banda de encabezado (filas 1 a 4) sobre fondo azul.
  const headerHeights = [26, 20, 18, 16];
  for (let r = 1; r <= 4; r++) {
    ws.getRow(r).height = headerHeights[r - 1];
    for (let c = 1; c <= LAST_COL; c++) ws.getCell(r, c).fill = fill(NAVY);
  }
  ws.mergeCells(1, 2, 1, LAST_COL);
  ws.mergeCells(2, 2, 2, LAST_COL);
  ws.mergeCells(3, 2, 3, LAST_COL);
  ws.mergeCells(4, 2, 4, LAST_COL);

  const t1 = ws.getCell(1, 2);
  t1.value = "MUTUAL TRABAJADORES PETROLERO PRIVADO DE TIERRA DEL FUEGO";
  t1.font = { name: "Calibri", size: 16, bold: true, color: { argb: WHITE } };
  t1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const t2 = ws.getCell(2, 2);
  t2.value = "LIQUIDACIÓN MENSUAL DE CUOTAS · ÓRDENES DE COMPRA";
  t2.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFB878" } };
  t2.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const t3 = ws.getCell(3, 2);
  t3.value = "Ameghino 867, Río Grande, Tierra del Fuego · Tel. 2964 42-2060";
  t3.font = { name: "Calibri", size: 10, color: { argb: MUTED } };
  t3.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  // Logo de la mutual a la izquierda de la banda.
  const logoPath = getSmallLogoPath();
  if (logoPath) {
    const imageId = workbook.addImage({ filename: logoPath, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0.2, row: 0.05 }, ext: { width: 92, height: 92 } });
  }

  // Línea naranja de acento (fila 5).
  ws.getRow(5).height = 5;
  for (let c = 1; c <= LAST_COL; c++) ws.getCell(5, c).fill = fill(ORANGE);

  // Datos de la liquidación (fila 7).
  ws.getRow(6).height = 8;
  ws.getRow(7).height = 22;
  const info: [number, number, string, string][] = [
    [1, 2, "EMPRESA", company.name.toUpperCase()],
    [4, 5, "PERÍODO", periodLabel],
    [7, 8, "EMITIDO", new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })],
  ];
  for (const [labelCol, valueCol, label, value] of info) {
    const l = ws.getCell(7, labelCol);
    l.value = label;
    l.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF5B7A99" } };
    l.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    const v = ws.getCell(7, valueCol);
    v.value = value;
    v.font = { name: "Calibri", size: 12, bold: true, color: { argb: NAVY } };
    v.alignment = { vertical: "middle", horizontal: "left" };
  }

  // Encabezado de la tabla (fila 8).
  const headers = [
    "N.º ASOCIADO", "APELLIDO Y NOMBRE", "D.N.I.", "FECHA ORDEN", "N.º DE ORDEN",
    "CUOTA", "VENCIMIENTO", "MONTO CUOTA", "TOTAL A DESCONTAR",
  ];
  const headerRow = ws.getRow(8);
  headerRow.height = 30;
  headers.forEach((text, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = text;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = fill(i === LAST_COL - 1 ? ORANGE : NAVY_SOFT);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: ORANGE } } };
  });

  // Filas de datos, con un color de fondo alternado por asociado.
  let row = 9;
  people.forEach((p, personIdx) => {
    const band = personIdx % 2 === 0 ? WHITE : SKY_SOFT;
    p.lines.forEach((l, idx) => {
      const r = ws.getRow(row);
      r.height = 18;
      const values: (string | number | Date | null)[] = [
        idx === 0 ? p.number : null,
        idx === 0 ? p.name : null,
        idx === 0 ? p.dni : null,
        l.fecha,
        l.orden,
        l.cuota,
        l.vence,
        l.monto,
        idx === 0 ? p.subtotal : null,
      ];
      values.forEach((value, i) => {
        const cell = r.getCell(i + 1);
        cell.value = value as ExcelJS.CellValue;
        cell.fill = fill(i === LAST_COL - 1 && idx === 0 ? ORANGE_SOFT : band);
        cell.font = { name: "Calibri", size: 10, color: { argb: INK }, bold: idx === 0 && (i === 1 || i === LAST_COL - 1) };
        cell.border = {
          top: idx === 0 ? thin("FF9DB4CC") : undefined,
          bottom: thin("FFD5E1EC"),
        };
        if (i === 3 || i === 6) {
          cell.numFmt = DATE_FORMAT;
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (i === 7 || i === 8) {
          cell.numFmt = MONEY_FORMAT;
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if (i === 1) {
          cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
        } else {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });
      row++;
    });
  });

  if (people.length === 0) {
    ws.mergeCells(row, 1, row, LAST_COL);
    const c = ws.getCell(row, 1);
    c.value = `No hay cuotas de órdenes de compra que venzan en ${periodLabel} para esta empresa.`;
    c.font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF5B7A99" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(row).height = 34;
    row++;
  }

  // Fila de total (naranja, destacada).
  row++;
  ws.getRow(row).height = 28;
  ws.mergeCells(row, 1, row, 8);
  const totalLabel = ws.getCell(row, 1);
  totalLabel.value = "TOTAL A DESCONTAR";
  totalLabel.font = { name: "Calibri", size: 13, bold: true, color: { argb: WHITE } };
  totalLabel.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  for (let c = 1; c <= LAST_COL; c++) ws.getCell(row, c).fill = fill(NAVY);
  const totalCell = ws.getCell(row, LAST_COL);
  totalCell.value = grandTotal;
  totalCell.numFmt = MONEY_FORMAT;
  totalCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: WHITE } };
  totalCell.fill = fill(ORANGE);
  totalCell.alignment = { horizontal: "right", vertical: "middle" };

  row++;
  ws.mergeCells(row, 1, row, LAST_COL);
  const summary = ws.getCell(row, 1);
  summary.value = `${people.length} asociado(s) · ${installmentsCount} cuota(s) · período ${periodLabel}`;
  summary.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF5B7A99" } };
  summary.alignment = { horizontal: "right", vertical: "middle" };

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, companyName: company.name, empty: people.length === 0 };
}
