import PDFDocument from "pdfkit";
import path from "path";
import { Response } from "express";

const LETTERHEAD = {
  title: "Mutual Trabajadores Petrolero Privado",
  subtitle: "de Tierra del Fuego",
  line1: "Fundada el 26 de octubre de 2013 - Matrícula N° 29 - INAES - C.U.I.T. N° 30714602884",
  line2: "Ameghino 867 - Río Grande - Tierra del Fuego e Islas del Atlántico Sur - Argentina.",
  line3: "Tel. 2964-422060 - Interno 111. Email: Mutualpetroleroprivadotdf@gmail.com",
};

function drawLetterhead(doc: PDFKit.PDFDocument) {
  const logoPath = path.join(__dirname, "..", "..", "assets", "logo.png");
  try {
    doc.image(logoPath, 40, 28, { width: 55 });
  } catch {
    // sigue sin el logo si no está disponible
  }
  doc.rect(35, 22, 525, 78).strokeColor("#333333").lineWidth(1).stroke();
  doc
    .fontSize(13)
    .fillColor("#000000")
    .text(LETTERHEAD.title, 105, 30, { width: 445, align: "center" })
    .fontSize(10)
    .text(LETTERHEAD.subtitle, 105, 46, { width: 445, align: "center" })
    .fontSize(7)
    .fillColor("#333333")
    .text(LETTERHEAD.line1, 105, 63, { width: 445, align: "center" })
    .text(LETTERHEAD.line2, 105, 73, { width: 445, align: "center" })
    .text(LETTERHEAD.line3, 105, 83, { width: 445, align: "center" })
    .fillColor("#000000");
}

// Ícono de sol simple (dibujado, sin necesitar un archivo aparte), como el
// que aparece al pie del formulario en papel.
function drawSunIcon(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number) {
  doc.save();
  doc.fillColor("#333333").circle(cx, cy, r * 0.45).fill();
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;
    const x1 = cx + Math.cos(angle) * r * 0.6;
    const y1 = cy + Math.sin(angle) * r * 0.6;
    const x2 = cx + Math.cos(angle) * r;
    const y2 = cy + Math.sin(angle) * r;
    doc.moveTo(x1, y1).lineTo(x2, y2).strokeColor("#333333").lineWidth(1.2).stroke();
  }
  doc.restore();
}

function drawFooter(doc: PDFKit.PDFDocument, y: number) {
  const logoPath = path.join(__dirname, "..", "..", "assets", "logo.png");
  try {
    doc.image(logoPath, 40, y - 5, { width: 26 });
  } catch {
    // sigue sin el logo si no está disponible
  }
  drawSunIcon(doc, 550, y + 8, 13);

  doc
    .fontSize(7)
    .font("Helvetica-Oblique")
    .fillColor("#555555")
    .text('"Compromiso con nuestra gente, impulsando el bienestar de su Familia"', 75, y, {
      width: 440,
      align: "center",
    })
    .text(
      "Piensa antes de imprimir. Cuidar el medio ambiente también es nuestra meta.",
      75,
      y + 9,
      { width: 440, align: "center" }
    )
    .text("Mutual Trabajadores Petrolero Privado de Tierra del Fuego.", 75, y + 18, {
      width: 440,
      align: "center",
    })
    .fillColor("#000000")
    .font("Helvetica");
}

function fieldLine(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  labelWidth: number,
  lineWidth: number
) {
  doc.fontSize(9.5).font("Helvetica-Bold").text(label, x, y, { continued: false });
  const lineX = x + labelWidth;
  doc.font("Helvetica").text(value || "", lineX + 4, y, { width: lineWidth - labelWidth - 4 });
  doc
    .moveTo(lineX, y + 12)
    .lineTo(lineX + lineWidth - labelWidth, y + 12)
    .strokeColor("#999999")
    .lineWidth(0.5)
    .stroke();
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-AR");
}

// Genera la Ficha de Alta del titular, replicando el formulario en papel
// (ajustado para entrar siempre en una sola hoja A4).
export function generateFichaAltaPdf(res: Response, affiliate: any) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="ficha-alta-${affiliate.lastName}-${affiliate.firstName}.pdf"`
  );

  const doc = new PDFDocument({ margin: 35, size: "A4" });
  doc.pipe(res);

  drawLetterhead(doc);

  doc
    .fontSize(15)
    .font("Helvetica-Bold")
    .text("FICHA DE ALTA", 35, 112, { width: 525, align: "center", underline: true });

  let y = 142;
  doc.fontSize(10).font("Helvetica-Bold").text("Datos del Asociado/a", 35, y, { underline: true });
  y += 18;

  const fullName = `${affiliate.lastName}, ${affiliate.firstName}`;
  fieldLine(doc, "Nombre completo:", fullName, 35, y, 95, 525);
  y += 22;

  fieldLine(doc, "C.U.I.L.:", affiliate.cuil || "", 35, y, 50, 255);
  fieldLine(doc, "N° de Asoc.:", affiliate.affiliateNumber || "", 310, y, 68, 250);
  y += 22;

  fieldLine(doc, "Fecha de Nac.:", fmtDate(affiliate.birthDate), 35, y, 78, 255);
  fieldLine(doc, "Teléfono:", affiliate.phone || "", 310, y, 52, 250);
  y += 20;

  fieldLine(doc, "Domicilio:", affiliate.address || "", 35, y, 60, 255);
  fieldLine(doc, "N°:", affiliate.addressNumber || "", 310, y, 22, 95);
  doc.fontSize(9).font("Helvetica-Bold").text(
    `Casa ${affiliate.addressType === "Casa" ? "☒" : "☐"}  Dpto. ${affiliate.addressType === "Dpto" ? "☒" : "☐"}  Piso: ${affiliate.floorApt || ""}`,
    420,
    y
  );
  y += 20;

  fieldLine(doc, "Localidad:", affiliate.locality || "", 35, y, 60, 255);
  fieldLine(doc, "Provincia:", affiliate.province || "", 310, y, 60, 250);
  y += 20;

  fieldLine(doc, "Correo electrónico:", affiliate.email || "", 35, y, 100, 525);
  y += 20;

  fieldLine(doc, "Empresa:", affiliate.company?.name || "", 35, y, 55, 255);
  fieldLine(doc, "Tipo de Socio:", affiliate.socioType || "", 310, y, 80, 250);
  y += 24;

  doc.moveTo(35, y).lineTo(560, y).strokeColor("#333333").lineWidth(1).stroke();
  y += 14;

  doc.fontSize(10).font("Helvetica-Bold").text("Declaración del Asociado/a", 35, y, { underline: true });
  y += 14;

  doc
    .fontSize(9.5)
    .font("Helvetica")
    .text(
      "Por medio del presente según establece la ley 20.321, solicito el Alta Voluntaria a la Mutual de " +
        "Trabajadores Petrolero Privado de Tierra del Fuego. Declaro haber sido informado/a de los beneficios y " +
        "descuentos que posee la Asociación, como así también de los derechos y obligaciones como asociado a la " +
        "misma, por lo que esta decisión es tomada por mi voluntad libre y consciente.",
      35,
      y,
      { width: 525, align: "justify", lineGap: 1 }
    );
  y = doc.y + 6;

  doc.text(
    "Por la presente y de conformidad con los Art. N.° 146 de la ley 20.744 otorgo mi expreso consentimiento en " +
      "mi calidad de asociado a la MUTUAL TRABAJADORES PETROLERO PRIVADO TIERRA DEL FUEGO para que la misma " +
      "proceda a practicar los descuentos correspondientes sobre los haberes que deba percibir en la empresa que " +
      "trabajo, por el monto y en las condiciones de la presente.",
    35,
    y,
    { width: 525, align: "justify", lineGap: 1 }
  );
  y = doc.y + 6;

  doc.text(
    "En caso de extinción de mi relación de trabajo con la empresa autorizo a la MUTUAL TRABAJADORES PETROLERO " +
      "PRIVADO TIERRA DEL FUEGO a descontar de las remuneraciones que en cualquier carácter deba percibir en la " +
      "dependencia el saldo que quedara pendiente de la presente autorización con absoluta prioridad respecto de " +
      "los otros saldos, que en mi carácter de dependencia de la empresa pudiera adeudar por cualquier causa o " +
      "emergentes de otros créditos que fueran otorgados.",
    35,
    y,
    { width: 525, align: "justify", lineGap: 1 }
  );
  y = doc.y + 10;

  fieldLine(doc, "Solicito que tenga efecto a partir del día:", "", 35, y, 235, 480);
  y += 26;

  fieldLine(doc, "Firma del Asociado:", "", 35, y, 100, 255);
  fieldLine(doc, "Aclaración:", "", 310, y, 60, 250);

  drawFooter(doc, 762);

  doc.end();
}

// Genera la Ficha de Familiares (hasta 3 participantes por hoja); si hay
// más de 3, se agregan hojas adicionales.
export function generateFichaFamiliaresPdf(res: Response, affiliate: any, dependents: any[]) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="ficha-familiares-${affiliate.lastName}-${affiliate.firstName}.pdf"`
  );

  const doc = new PDFDocument({ margin: 35, size: "A4" });
  doc.pipe(res);

  const chunks: any[][] = [];
  for (let i = 0; i < Math.max(dependents.length, 1); i += 3) {
    chunks.push(dependents.slice(i, i + 3));
  }

  chunks.forEach((group, pageIndex) => {
    if (pageIndex > 0) doc.addPage();
    drawLetterhead(doc);

    let y = 118;
    const slots = [group[0], group[1], group[2]];

    slots.forEach((dep, idx) => {
      const ordinal = ["1°", "2°", "3°"][idx];
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`Datos del Participante ${ordinal})`, 35, y);
      y += 17;

      fieldLine(doc, "Nombre completo:", dep?.fullName || "", 35, y, 95, 325);
      fieldLine(doc, "Parentesco:", dep?.parentesco || "", 385, y, 65, 175);
      y += 19;

      fieldLine(doc, "C.U.I.L.:", dep?.cuil || "", 35, y, 50, 155);
      fieldLine(doc, "Fecha Nac.:", fmtDate(dep?.birthDate), 200, y, 62, 145);
      fieldLine(doc, "N° Asoc.:", dep?.dependentNumber || "", 385, y, 55, 175);
      y += 19;

      fieldLine(doc, "Domicilio:", dep?.address || "", 35, y, 60, 190);
      fieldLine(doc, "N°:", dep?.addressNumber || "", 235, y, 20, 75);
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .text(`Casa ${dep?.addressType === "Casa" ? "☒" : "☐"}  Dpto. ${dep?.addressType === "Dpto" ? "☒" : "☐"}  Piso: ${dep?.floorApt || ""}`, 330, y);
      y += 19;

      fieldLine(doc, "Localidad:", dep?.locality || "", 35, y, 60, 255);
      fieldLine(doc, "Provincia:", dep?.province || "", 310, y, 60, 250);
      y += 19;

      fieldLine(doc, "Teléfono:", dep?.phone || "", 35, y, 55, 255);
      fieldLine(doc, "Correo electrónico:", dep?.email || "", 310, y, 100, 250);
      y += 28;

      doc.moveTo(35, y - 6).lineTo(560, y - 6).strokeColor("#dddddd").lineWidth(0.5).stroke();
    });

    y += 12;
    doc.fontSize(9).font("Helvetica-Bold").text("Para uso exclusivo de la Mutual Trabajadores Petrolero Privado TDF", 35, y);
    y += 18;
    fieldLine(doc, "Recibido por:", "", 35, y, 70, 255);
    fieldLine(doc, "Firma:", "", 310, y, 38, 250);
    y += 22;
    fieldLine(doc, "Fecha de recepción:", "", 35, y, 110, 255);

    drawFooter(doc, 760);
  });

  doc.end();
}
