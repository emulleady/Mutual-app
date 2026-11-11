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
const TOTAL_COL = 10; // columna J: total a descontar
const LAST_COL = 12; // columnas A..L (K = MEDIFE, L = SUELDO)

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
export type LiquidacionLine = { detalle: string; fecha: Date | null; orden: string; cuota: string; vence: Date | null; monto: number; installmentId?: number };
export type LiquidacionPerson = { number: string; name: string; dni: string; medife: number | null; subtotal: number; lines: LiquidacionLine[] };

// Calcula (sin armar el Excel) lo que hay que descontar a una empresa en un
// mes: cuota social + cuotas de ordenes de compra. Lo usa el Excel y las cobranzas.
export async function computeLiquidacionData(companyId: number, month: string) {
  const range = parseMonth(month);
  if (!range) return null;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  const affiliates = await prisma.affiliate.findMany({
    where: { companyId, status: "active" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      dependents: { where: { active: true }, orderBy: { id: "asc" }, include: { services: { where: { active: true }, include: { serviceType: true } } } },
      services: { where: { active: true }, include: { serviceType: true } },
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
  // Cada asociado activo lleva: su cuota social, la de cada familiar con tipo
  // de socio (adherente, participante...) y las cuotas de ordenes de compra
  // que vencen en el mes. La cuota social se suma aunque no tenga ordenes.
  type Line = LiquidacionLine;
  const people: LiquidacionPerson[] = [];

  const feeSettings = await prisma.membershipFeeSetting.findMany();
  const feeByType = new Map(feeSettings.map((f: { socioType: string; feeAmount: number }) => [f.socioType.trim().toLowerCase(), f.feeAmount]));
  const feeFor = (own: number | null | undefined, socioType: string | null | undefined): number => {
    if (own != null) return own;
    if (!socioType) return 0;
    return feeByType.get(socioType.trim().toLowerCase()) ?? 0;
  };
  let withoutFee = 0; // personas a las que no se les pudo calcular cuota social
  let feeTotal = 0;
  let serviceTotal = 0;
  // Quienes quedan SIN cuota social y por que, para revisarlos (hoja "REVISAR").
  const review: { number: string; name: string; who: string; reason: string }[] = [];

  for (const a of affiliates) {
    const lines: Line[] = [];
    const titularName = `${a.lastName}, ${a.firstName}`.toUpperCase();

    // Cuota social del titular: sin tipo de socio cargado se toma como "Activo"
    // (igual que en la Orden de Compra). Un valor propio del asociado pisa el
    // valor del tipo de socio.
    const titularType = a.socioType || "Activo";
    if (titularType.toLowerCase() !== "no socio") {
      const titularFee = feeFor(a.feeAmount, titularType);
      if (titularFee > 0) {
        lines.push({ detalle: `Cuota social - Titular (${titularType})`, fecha: null, orden: "", cuota: "", vence: null, monto: Number(titularFee.toFixed(2)) });
        feeTotal += titularFee;
      } else {
        withoutFee++;
        review.push({ number: a.affiliateNumber, name: titularName, who: "Titular", reason: `No hay valor de cuota para el tipo de socio "${titularType}" (cargarlo en Configuración o en la ficha)` });
      }
    }

    // Cuota social de cada familiar activo (adherente, participante...).
    for (const d of a.dependents) {
      if (d.registryStatus && d.registryStatus.toUpperCase().includes("BAJA")) continue;
      if (!d.socioType) {
        review.push({ number: a.affiliateNumber, name: titularName, who: `Familiar ${d.fullName}`, reason: "Falta asignarle el tipo de socio (Adherente, Participante…) en la pestaña Familiares" });
        withoutFee++;
        continue;
      }
      if (d.socioType.toLowerCase() === "no socio") continue;
      // El Participante paga según el tipo de su titular: "Participante Activo"
      // o "Participante Adherente" (valores en Configuración). Si no existe ese
      // valor, se usa el de "Participante" a secas.
      const isParticipante = d.socioType.trim().toLowerCase() === "participante";
      let fee = feeFor(d.feeAmount, isParticipante ? `Participante ${titularType}` : d.socioType);
      if (isParticipante && fee <= 0) fee = feeFor(d.feeAmount, d.socioType);
      if (fee > 0) {
        lines.push({ detalle: `Cuota social - ${isParticipante ? `Participante (titular ${titularType})` : d.socioType}: ${d.fullName}`, fecha: null, orden: "", cuota: "", vence: null, monto: Number(fee.toFixed(2)) });
        feeTotal += fee;
      } else {
        withoutFee++;
        review.push({ number: a.affiliateNumber, name: titularName, who: `Familiar ${d.fullName}`, reason: `No hay valor de cuota para el tipo de socio "${d.socioType}"` });
      }
    }

    // Servicios cargados individualmente (titular y familiares activos), con
    // el costo propio de cada uno.
    for (const s of (a as any).services || []) {
      if (!(s.amount > 0)) continue;
      lines.push({ detalle: `Servicio - ${s.serviceType?.name || "Servicio"} (Titular)`, fecha: null, orden: "", cuota: "", vence: null, monto: Number(s.amount.toFixed(2)) });
      serviceTotal += s.amount;
    }
    for (const d of a.dependents) {
      if (d.registryStatus && d.registryStatus.toUpperCase().includes("BAJA")) continue;
      for (const s of (d as any).services || []) {
        if (!(s.amount > 0)) continue;
        lines.push({ detalle: `Servicio - ${s.serviceType?.name || "Servicio"}: ${d.fullName}`, fecha: null, orden: "", cuota: "", vence: null, monto: Number(s.amount.toFixed(2)) });
        serviceTotal += s.amount;
      }
    }

    for (const loan of a.loans) {
      for (const inst of loan.installments) {
        lines.push({
          detalle: "Orden de compra",
          fecha: loan.grantedAt,
          orden: loan.orderNumber || String(loan.id),
          cuota: `${inst.number}/${loan.installmentsCount}`,
          installmentId: inst.id,
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
      medife: (a as any).medifeFee ?? null,
      subtotal: Number(lines.reduce((sum, l) => sum + l.monto, 0).toFixed(2)),
      lines,
    });
  }

  const grandTotal = Number(people.reduce((sum, p) => sum + p.subtotal, 0).toFixed(2));
  const installmentsCount = people.reduce((sum, p) => sum + p.lines.filter((l) => l.orden !== "").length, 0);
  return { company, range, people, grandTotal, installmentsCount, feeTotal, serviceTotal, withoutFee, review };
}

export async function buildCompanyMonthlyLiquidacion(
  companyId: number,
  month: string
): Promise<{ buffer: Buffer; companyName: string; empty: boolean } | null> {
  const data = await computeLiquidacionData(companyId, month);
  if (!data) return null;
  const { company, range, people, grandTotal, installmentsCount, feeTotal, serviceTotal, withoutFee, review } = data;
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
    { width: 14 }, { width: 34 }, { width: 13 }, { width: 42 }, { width: 13 }, { width: 14 },
    { width: 9 }, { width: 14 }, { width: 16 }, { width: 22 },
    { width: 16 }, { width: 18 },
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
  t2.value = "LIQUIDACIÓN MENSUAL · CUOTA SOCIAL Y ÓRDENES DE COMPRA";
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
    [8, 9, "EMITIDO", new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })],
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
    "N.º ASOCIADO", "APELLIDO Y NOMBRE", "D.N.I.", "DETALLE", "FECHA ORDEN", "N.º DE ORDEN",
    "CUOTA", "VENCIMIENTO", "MONTO CUOTA", "TOTAL A DESCONTAR", "MEDIFE", "SUELDO",
  ];
  const headerRow = ws.getRow(8);
  headerRow.height = 30;
  headers.forEach((text, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = text;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = fill(i === TOTAL_COL - 1 ? ORANGE : NAVY_SOFT);
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
        l.detalle,
        l.fecha,
        l.orden,
        l.cuota,
        l.vence,
        l.monto,
        idx === 0 ? p.subtotal : null,
        idx === 0 ? p.medife : null, // MEDIFE
        null, // SUELDO: lo completa la empresa
      ];
      values.forEach((value, i) => {
        const cell = r.getCell(i + 1);
        cell.value = value as ExcelJS.CellValue;
        cell.fill = fill(i === TOTAL_COL - 1 && idx === 0 ? ORANGE_SOFT : i === 11 ? "FFFFF9E5" : band);
        cell.font = { name: "Calibri", size: 10, color: { argb: INK }, bold: idx === 0 && (i === 1 || i === TOTAL_COL - 1) };
        cell.border = {
          top: idx === 0 ? thin("FF9DB4CC") : undefined,
          bottom: thin("FFD5E1EC"),
        };
        if (i === 4 || i === 7) {
          cell.numFmt = DATE_FORMAT;
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (i === 8 || i === 9 || i === 10 || i === 11) {
          cell.numFmt = MONEY_FORMAT;
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if (i === 1 || i === 3) {
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
    c.value = `No hay cuotas sociales ni cuotas de órdenes de compra para descontar en ${periodLabel} en esta empresa.`;
    c.font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF5B7A99" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(row).height = 34;
    row++;
  }

  // Fila de total (naranja, destacada).
  row++;
  ws.getRow(row).height = 28;
  ws.mergeCells(row, 1, row, TOTAL_COL - 1);
  const totalLabel = ws.getCell(row, 1);
  totalLabel.value = "TOTAL A DESCONTAR";
  totalLabel.font = { name: "Calibri", size: 13, bold: true, color: { argb: WHITE } };
  totalLabel.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  for (let c = 1; c <= LAST_COL; c++) ws.getCell(row, c).fill = fill(NAVY);
  const totalCell = ws.getCell(row, TOTAL_COL);
  totalCell.value = grandTotal;
  totalCell.numFmt = MONEY_FORMAT;
  totalCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: WHITE } };
  totalCell.fill = fill(ORANGE);
  totalCell.alignment = { horizontal: "right", vertical: "middle" };

  row++;
  ws.mergeCells(row, 1, row, LAST_COL);
  const summary = ws.getCell(row, 1);
  summary.value =
    `${people.length} asociado(s) · cuota social $${feeTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ·${serviceTotal > 0 ? ` servicios $${serviceTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ·` : ""} ${installmentsCount} cuota(s) de órdenes · período ${periodLabel}` +
    (withoutFee > 0 ? ` · ${withoutFee} persona(s) sin cuota social: ver la hoja REVISAR` : "");
  summary.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF5B7A99" } };
  summary.alignment = { horizontal: "right", vertical: "middle" };

  // Hoja "REVISAR": quienes no tienen cuota social calculada y por que.
  if (review.length > 0) {
    const rv = workbook.addWorksheet("REVISAR");
    rv.columns = [{ width: 16 }, { width: 34 }, { width: 34 }, { width: 80 }];
    rv.addRow(["Personas SIN cuota social en esta liquidación (para revisar antes de enviarla)"]).font = { bold: true, size: 12 };
    rv.addRow([]);
    const hr = rv.addRow(["N.º ASOCIADO", "TITULAR", "PERSONA", "MOTIVO"]);
    hr.eachCell((c) => {
      c.font = { bold: true, color: { argb: WHITE } };
      c.fill = fill(NAVY_SOFT);
    });
    for (const r of review) rv.addRow([r.number, r.name, r.who, r.reason]);
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, companyName: company.name, empty: people.length === 0 };
}
