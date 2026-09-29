import PDFDocument from "pdfkit";
import { Response } from "express";
import { drawLetterhead, drawFooter, fieldLine, fmtDate } from "../affiliates/forms";

// Convierte un número entero (hasta 999) a su forma en palabras, en
// español, para el "Cuota/s: 5 (CINCO)" de la Orden de Compra.
const UNITS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const TEENS = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const TENS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];

function numberToWords(n: number): string {
  if (n === 0) return "CERO";
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 30) return n === 20 ? "VEINTE" : `VEINTI${UNITS[n - 20]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const rest = n % 10;
    return rest === 0 ? TENS[tens] : `${TENS[tens]} Y ${UNITS[rest]}`;
  }
  if (n === 100) return "CIEN";
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return `${UNITS[hundreds]}CIENTOS${rest ? " " + numberToWords(rest) : ""}`;
  }
  return String(n);
}

function fmtMoney(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Genera la Orden de Compra en PDF, lista para que el afiliado la firme,
// replicando el formulario "AUTORIZACION DE DESCUENTO DE HABERES".
export function generateOrdenCompraPdf(res: Response, loan: any, affiliate: any) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="orden-compra-${loan.orderNumber || loan.id}.pdf"`
  );

  const doc = new PDFDocument({ margin: 35, size: "A4" });
  doc.pipe(res);

  drawLetterhead(doc);

  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("ORDEN DE COMPRA", 35, 112, { width: 525, align: "center", underline: true });
  doc
    .fontSize(11)
    .text("AUTORIZACIÓN DE DESCUENTO DE HABERES", 35, 132, { width: 525, align: "center" });

  let y = 165;
  fieldLine(doc, "Fecha:", fmtDate(loan.grantedAt), 35, y, 45, 200);
  fieldLine(doc, "Lugar:", "Río Grande, Tierra del Fuego", 235, y, 42, 200);
  doc.fontSize(9.5).font("Helvetica-Bold").text(`N° ${loan.orderNumber || ""}`, 480, y);
  y += 30;

  doc.moveTo(35, y).lineTo(560, y).strokeColor("#333333").lineWidth(1).stroke();
  y += 14;

  doc.fontSize(10).font("Helvetica-Bold").text("DATOS SOCIO ACTIVO", 35, y, { underline: true });
  y += 20;

  const fullName = `${affiliate.lastName}, ${affiliate.firstName}`;
  fieldLine(doc, "Apellido y Nombre:", fullName, 35, y, 110, 335);
  fieldLine(doc, "Firma:", "", 385, y, 40, 175);
  y += 24;

  fieldLine(doc, "Empresa:", affiliate.company?.name || "", 35, y, 60, 185);
  fieldLine(doc, "Asociado/a N.º:", `${affiliate.affiliateNumber || ""}/00`, 235, y, 90, 145);
  fieldLine(doc, "Comercio:", loan.loanType || "", 400, y, 62, 160);
  y += 24;

  fieldLine(doc, "Importe Total de Compra: $", fmtMoney(loan.amount), 35, y, 145, 260);
  y += 24;

  fieldLine(
    doc,
    "Cuota/s:",
    `${loan.installmentsCount} (${numberToWords(loan.installmentsCount)})`,
    35,
    y,
    50,
    255
  );
  fieldLine(doc, "Monto Cuotas: $", fmtMoney(loan.installmentValue), 310, y, 90, 250);
  y += 40;

  doc.moveTo(35, y).lineTo(560, y).strokeColor("#333333").lineWidth(1).stroke();

  drawFooter(doc, 762);

  doc.end();
}
