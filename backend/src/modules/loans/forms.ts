import PDFDocument from "pdfkit";
import { Response } from "express";
import { drawLetterhead, drawFooter, fieldLine, fmtDate } from "../affiliates/forms";

// --- Conversión de números a letras, en español ---

const UNITS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const TEENS = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const TENS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

// Hasta 999 (para "Cuota/s: 5 (CINCO)", donde nunca va a haber más de un
// par de dígitos, pero se admite hasta 999 igual).
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
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return `${HUNDREDS[hundreds]}${rest ? " " + numberToWords(rest) : ""}`;
}

// Grupo de 3 cifras (000 a 999), con la forma especial de "cien/ciento" y
// de "un" cuando el grupo vale exactamente 1 (para no decir "UNO MIL").
function threeDigitGroup(n: number, isOne = false): string {
  if (n === 0) return "";
  if (n === 1 && isOne) return "UN";
  return numberToWords(n);
}

// Convierte un entero (hasta 999.999.999) a letras, en español, con la
// forma "UN MILLÓN", "DOS MIL", etc.
function integerToWords(n: number): string {
  if (n === 0) return "CERO";

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];

  if (millions > 0) {
    parts.push(millions === 1 ? "UN MILLÓN" : `${numberToWords(millions)} MILLONES`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? "MIL" : `${numberToWords(thousands)} MIL`);
  }
  if (rest > 0) {
    parts.push(threeDigitGroup(rest));
  }

  return parts.join(" ").trim();
}

// "UN MILLON CUATROCIENTOS VEINTICINCO MIL CON CERO CENTAVOS ($1.425.000,00)",
// igual al texto del formulario en papel.
function amountInWords(amount: number): string {
  const pesos = Math.floor(amount);
  const centavos = Math.round((amount - pesos) * 100);
  const pesosWords = integerToWords(pesos);
  const centavosWords = centavos === 0 ? "CERO" : numberToWords(centavos);
  return `${pesosWords} CON ${centavosWords} CENTAVOS (${fmtMoney(amount)})`;
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Formatea un DNI con puntos de miles, ej. "31180083" -> "31.180.083".
function fmtDni(dni: string | null | undefined): string {
  if (!dni) return "";
  const digits = dni.replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Genera la Orden de Compra en PDF: dos cupones en la misma hoja (uno para
// la Mutual, otro más completo para el Comercio/Socio, con las cláusulas
// de reconocimiento de deuda), tal cual el formulario en papel.
export function generateOrdenCompraPdf(res: Response, loan: any, affiliate: any) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="orden-compra-${loan.orderNumber || loan.id}.pdf"`
  );

  const doc = new PDFDocument({ margin: 35, size: "A4" });
  doc.pipe(res);

  const fullNameNormal = `${affiliate.lastName}, ${affiliate.firstName}`;
  const fullNameUpper = `${affiliate.lastName} ${affiliate.firstName}`.toUpperCase();
  const orderNumber = loan.orderNumber || "";
  const asociadoNumero = `${affiliate.affiliateNumber || ""}/00`;

  // ---------- Cupón 1: para la Mutual (compacto) ----------
  drawLetterhead(doc);

  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("ORDEN DE COMPRA", 35, 112, { width: 525, align: "center", underline: true });
  doc
    .fontSize(11)
    .text("AUTORIZACIÓN DE DESCUENTO DE HABERES", 35, 132, { width: 525, align: "center" });

  let y = 162;
  fieldLine(doc, "Fecha:", fmtDate(loan.grantedAt), 35, y, 45, 200);
  fieldLine(doc, "Lugar:", "Río Grande, Tierra del Fuego", 235, y, 42, 200);
  doc.fontSize(9.5).font("Helvetica-Bold").text(`N° ${orderNumber}`, 480, y);
  y += 26;

  doc.moveTo(35, y).lineTo(560, y).strokeColor("#333333").lineWidth(1).stroke();
  y += 12;

  doc.fontSize(10).font("Helvetica-Bold").text("DATOS SOCIO ACTIVO", 35, y, { underline: true });
  y += 18;

  fieldLine(doc, "Apellido y Nombre:", fullNameNormal, 35, y, 110, 335);
  fieldLine(doc, "Firma:", "", 385, y, 40, 175);
  y += 22;

  fieldLine(doc, "Empresa:", affiliate.company?.name || "", 35, y, 60, 185);
  fieldLine(doc, "Asociado/a N.º:", asociadoNumero, 235, y, 90, 145);
  fieldLine(doc, "Comercio:", loan.loanType || "", 400, y, 62, 160);
  y += 22;

  fieldLine(doc, "Importe Total de Compra: $", loan.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 }), 35, y, 150, 255);
  y += 22;

  fieldLine(
    doc,
    "Cuota/s:",
    `${loan.installmentsCount} (${numberToWords(loan.installmentsCount)})`,
    35,
    y,
    50,
    255
  );
  fieldLine(
    doc,
    "Monto Cuotas: $",
    loan.installmentValue.toLocaleString("es-AR", { minimumFractionDigits: 2 }),
    310,
    y,
    90,
    250
  );
  y += 16;

  doc.fontSize(9).font("Helvetica-Bold").text("MUTUAL", 500, y, { width: 60, align: "right" });
  y += 20;

  // ---------- Línea de corte ----------
  doc
    .moveTo(35, y)
    .lineTo(560, y)
    .dash(4, { space: 3 })
    .strokeColor("#888888")
    .lineWidth(1)
    .stroke()
    .undash();
  y += 16;

  // ---------- Cupón 2: para el Comercio / Socio (completo) ----------
  const topOfCoupon2 = y;
  drawLetterhead(doc, topOfCoupon2);

  y = topOfCoupon2 + 90;
  doc
    .fontSize(15)
    .font("Helvetica-Bold")
    .text("ORDEN DE COMPRA", 35, y, { width: 525, align: "center" });
  y += 22;
  doc
    .fontSize(13)
    .text("AUTORIZACIÓN DE DESCUENTO DE HABERES", 35, y, { width: 525, align: "center", underline: true });
  y += 24;

  fieldLine(doc, "Fecha:", fmtDate(loan.grantedAt), 35, y, 45, 350);
  doc.fontSize(9.5).font("Helvetica-Bold").text(`N° ${orderNumber}`, 480, y);
  y += 20;

  doc.fontSize(10).font("Helvetica-Bold").text("DATOS SOCIO ACTIVO:", 35, y, { underline: true });
  y += 16;

  fieldLine(doc, "Apellido y Nombre:", fullNameNormal, 35, y, 105, 300);
  fieldLine(doc, "Empresa:", affiliate.company?.name || "", 350, y, 55, 175);
  y += 18;

  fieldLine(doc, "Asociado/a N.º:", asociadoNumero, 35, y, 90, 260);
  fieldLine(doc, "Comercio:", loan.loanType || "", 310, y, 58, 215);
  y += 18;

  fieldLine(doc, "Importe Total Compra Pesos: $", loan.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 }), 35, y, 175, 260);
  y += 18;

  fieldLine(
    doc,
    "Cuota/s:",
    `${loan.installmentsCount} (${numberToWords(loan.installmentsCount)})`,
    35,
    y,
    50,
    220
  );
  fieldLine(
    doc,
    "Monto Cuotas: $",
    loan.installmentValue.toLocaleString("es-AR", { minimumFractionDigits: 2 }),
    270,
    y,
    88,
    250
  );
  y += 22;

  doc
    .fontSize(8)
    .font("Helvetica")
    .text(
      "Por la presente y de conformidad con los art. 146 de la ley 20.744 y TO DN 0390/76 otorgo mi expreso " +
        "consentimiento en mi calidad de asociado a LA MUTUAL TRABAJADORES PETROLERO PRIVADO TIERRA DEL FUEGO " +
        "para que la misma proceda a practicar los descuentos correspondientes sobre los haberes que deba " +
        "percibir en la empresa que trabajo, por el monto y en las condiciones de la presente. En caso de " +
        "extinción de mi relación de trabajo con la empresa autorizo a LA EMPRESA a descontar, de las " +
        "remuneraciones que en cualquier carácter deba percibir, el saldo que quedara pendiente de la presente " +
        "ORDEN DE COMPRA, con absoluta prioridad respecto de los otros saldos que en mi carácter como trabajador " +
        "de la empresa pudiera adeudar por cualquier causa y/o créditos que me fueran otorgados.",
      35,
      y,
      { width: 525, align: "justify", lineGap: 0.5 }
    );
  y = doc.y + 8;

  const domicilioCompleto = [
    affiliate.address,
    affiliate.addressNumber ? `N.º ${affiliate.addressNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const localidadCompleta = affiliate.locality ? `${affiliate.locality}-T.D.F.` : "Tierra del Fuego";

  doc.text(
    `El Socio: ${fullNameUpper} con D.N.I.: ${fmtDni(affiliate.dni)} Domicilio en ${domicilioCompleto}, ` +
      `${localidadCompleta} reconoce adeudar la suma de ${amountInWords(loan.amount)} a la Mutual de ` +
      "Trabajadores Petrolero Privado de Tierra del Fuego, sirviendo el presente como comprobante de deuda. " +
      "Para el caso en que la deuda no sea cancelada en el plazo establecido oportunamente, el presente " +
      "documento sirve como reconocimiento de deuda habilitando a la Mutual a iniciar la ejecución judicial de " +
      "la misma, para lo cual las partes acuerdan por la presente someterse en caso de controversia a los " +
      "Tribunales Ordinarios del Distrito Judicial Norte de la Provincia de Tierra del Fuego A. e I.A.S.",
    35,
    y,
    { width: 525, align: "justify", lineGap: 0.5 }
  );
  y = doc.y + 12;

  const lastInstallment = (loan.installments || [])[loan.installments?.length - 1];
  fieldLine(doc, "Vencimiento:", lastInstallment ? fmtDate(lastInstallment.dueDate) : "", 35, y, 65, 260);
  y += 26;

  fieldLine(doc, "", "", 35, y, 0, 130);
  fieldLine(doc, "", "", 175, y, 0, 130);
  fieldLine(doc, "", "", 320, y, 0, 100);
  fieldLine(doc, "", "", 430, y, 0, 100);
  y += 12;

  doc.fontSize(8).font("Helvetica-Bold");
  doc.text("Aclaración y Firma Mutual", 35, y, { width: 130, align: "center" });
  doc.text("Firma Asociado/a", 175, y, { width: 130, align: "center" });
  doc.text("Aclaración", 320, y, { width: 100, align: "center" });
  doc.text("D.N.I.", 430, y, { width: 100, align: "center" });
  y += 18;

  doc.fontSize(9).font("Helvetica-Bold").text("COMERCIO", 500, y, { width: 60, align: "right" });

  doc.end();
}
