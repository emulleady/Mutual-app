import * as XLSX from "xlsx";
import { prisma } from "../../db";
import { recalculateOverdueInstallments } from "../loans/mora";

const MONEY_FORMAT = '_-"$"\\ * #,##0.00_-;\\-"$"\\ * #,##0.00_-;_-"$"\\ * "-"??_-;_-@_-';

export interface LiquidacionExtras {
  obraSocial: number;
  cuotaMutual: number;
  sueldoBruto: number;
}

// Arma el Excel de liquidación para un afiliado dado de baja con deuda:
// una fila por cada Orden de Compra con saldo pendiente, más los tres
// conceptos adicionales que carga la mutual a mano (Obra Social, Cuota
// Mutual, 1% Sueldo Bruto), y el total general de deuda — igual al
// modelo en papel que ya usaban.
export async function buildLiquidacionWorkbook(
  affiliateId: number,
  extras: LiquidacionExtras
): Promise<{ buffer: Buffer; affiliateName: string } | null> {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate) return null;

  const loans = await prisma.loan.findMany({
    where: { affiliateId, status: { in: ["active", "overdue", "pending", "approved"] } },
    orderBy: { grantedAt: "asc" },
  });

  const rows: {
    fecha: Date;
    orden: string;
    cuotas: number;
    cuotasPagas: number;
    montoCuotas: number;
  }[] = [];

  for (const loan of loans) {
    await recalculateOverdueInstallments(loan.id);
    const paidCount = await prisma.loanInstallment.count({
      where: { loanId: loan.id, status: "paid" },
    });
    rows.push({
      fecha: loan.grantedAt,
      orden: loan.orderNumber || String(loan.id),
      cuotas: loan.installmentsCount,
      cuotasPagas: paidCount,
      montoCuotas: loan.installmentValue,
    });
  }

  const sheetRows: (string | number | Date | null)[][] = [];
  const fullName = `${affiliate.firstName} ${affiliate.lastName}`.toUpperCase();
  sheetRows.push([`LIQUIDACION - ${fullName}           D.N.I.: ${affiliate.dni}`]);
  sheetRows.push([
    "FECHA",
    "N.º DE ORDEN",
    "CUOTAS",
    "CUOTAS PAGAS",
    "CUOTAS IMPAGAS",
    "MONTO CUOTAS",
    "TOTAL DEUDA ORDENES",
    "OBRA SOCIAL",
    "CUOTA MUTUAL",
    "1% SUELDO BRUTO",
  ]);

  let totalMontoCuotas = 0;
  let totalDeudaOrdenes = 0;

  rows.forEach((r, idx) => {
    const cuotasImpagas = r.cuotas - r.cuotasPagas;
    const totalOrden = r.montoCuotas * cuotasImpagas;
    totalMontoCuotas += r.montoCuotas;
    totalDeudaOrdenes += totalOrden;
    sheetRows.push([
      r.fecha,
      r.orden,
      r.cuotas,
      r.cuotasPagas,
      cuotasImpagas,
      r.montoCuotas,
      totalOrden,
      idx === 0 ? extras.obraSocial : 0,
      idx === 0 ? extras.cuotaMutual : 0,
      idx === 0 ? extras.sueldoBruto : 0,
    ]);
  });

  if (rows.length === 0) {
    sheetRows.push([null, null, 0, 0, 0, 0, 0, extras.obraSocial, extras.cuotaMutual, extras.sueldoBruto]);
  }

  const totalGeneral =
    totalDeudaOrdenes + extras.obraSocial + extras.cuotaMutual + extras.sueldoBruto;

  sheetRows.push([null, null, null, null, null, totalMontoCuotas, totalDeudaOrdenes, extras.obraSocial, extras.cuotaMutual, extras.sueldoBruto]);
  sheetRows.push([null, null, null, null, null, null, "TOTAL DEUDA", null, null, totalGeneral]);

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);

  // Formato moneda para las columnas de montos, y fecha para la columna A.
  const moneyCols = [5, 6, 7, 8, 9]; // F..J (0-indexed)
  for (let r = 2; r < sheetRows.length; r++) {
    const dateCell = worksheet[XLSX.utils.encode_cell({ r, c: 0 })];
    if (dateCell && dateCell.v instanceof Date) {
      dateCell.z = "mm-dd-yy";
    }
    for (const c of moneyCols) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") {
        cell.z = MONEY_FORMAT;
      }
    }
  }

  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  worksheet["!cols"] = [
    { wch: 11 }, { wch: 14 }, { wch: 8 }, { wch: 13 }, { wch: 14 },
    { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "LIQUIDACION");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true });

  return { buffer, affiliateName: `${affiliate.lastName}-${affiliate.firstName}` };
}
