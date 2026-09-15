import * as XLSX from "xlsx";
import { prisma } from "../../db";
import { logAffiliateEvent, logAudit } from "../../middleware/audit";

// Orden de columnas EXACTO que usa la planilla de la mutual (A a X).
// Si el dia de mañana cambia el orden de columnas en la planilla, hay
// que actualizar este array en el mismo orden.
const COLUMNS = [
  "affiliateNumber",   // A - Nº Asociado
  "fullName",           // B - Apellido y Nombre
  "dni",                 // C - DNI
  "cuil",                // D - CUIL
  "companyName",         // E - Empresa
  "yacimiento",           // F - Yacimiento
  "puesto",               // G - Puesto
  "companyEntryDate",     // H - Fecha Ingreso (empresa)
  "leaveDate1",           // I - Baja
  "reEntryDate",          // J - Fecha Alta nuevo
  "leaveDate2",           // K - Baja
  "activeNote",           // L - Activos
  "parentesco",           // M - Parentesco
  "birthDate",            // N - Fecha Naci
  "healthProvider",       // O - Obra Social
  "coveragePercentage",   // P - Al 100% - 60%
  "healthProviderEntryDate", // Q - Fecha Ingreso (obra social)
  "registryStatus",       // R - Estado
  "address",              // S - Domicilio
  "floorApt",             // T - Piso y Dpto
  "locality",             // U - Localidad
  "province",             // V - Provincia
  "phone",                // W - Telefono
  "email",                // X - Email
] as const;

type RawRow = Record<(typeof COLUMNS)[number], any>;

interface ImportError {
  row: number;
  reason: string;
}

interface ImportResult {
  titularsCreated: number;
  titularsUpdated: number;
  dependentsCreated: number;
  dependentsUpdated: number;
  errors: ImportError[];
}

function toText(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function toDate(value: any): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

// "Apellido y Nombre" viene como una sola celda. La convencion mas comun
// en este tipo de planilla es "Apellido, Nombre" (separado por coma).
// Si no hay coma, se guarda todo en apellido y se deja constancia en el
// warning para que se revise a mano despues.
function splitFullName(fullName: string): { firstName: string; lastName: string; warning?: string } {
  if (fullName.includes(",")) {
    const [lastName, firstName] = fullName.split(",");
    return { lastName: lastName.trim(), firstName: (firstName || "").trim() };
  }
  return {
    lastName: fullName.trim(),
    firstName: "",
    warning: "No se pudo separar apellido y nombre (no tiene coma) — se cargó todo como apellido, revisar a mano.",
  };
}

export async function importAffiliatesFromExcel(
  buffer: Buffer,
  userId: number | undefined
): Promise<ImportResult> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const result: ImportResult = {
    titularsCreated: 0,
    titularsUpdated: 0,
    dependentsCreated: 0,
    dependentsUpdated: 0,
    errors: [],
  };

  // Se asume que la primera fila es el encabezado.
  const dataRows = rows.slice(1);

  // Cache de empresas ya resueltas en esta importacion, para no consultar
  // la base repetidas veces por el mismo nombre.
  const companyCache = new Map<string, number>();

  async function resolveCompanyId(name: string | undefined): Promise<number | undefined> {
    if (!name) return undefined;
    const key = name.trim().toLowerCase();
    if (companyCache.has(key)) return companyCache.get(key);

    let company = await prisma.company.findFirst({ where: { name: { equals: name.trim() } } });
    if (!company) {
      company = await prisma.company.create({ data: { name: name.trim() } });
    }
    companyCache.set(key, company.id);
    return company.id;
  }

  // Se recuerda el titular procesado mas reciente para cada Nº Asociado,
  // para poder asociarle los familiares que vengan en filas siguientes
  // (aunque tambien se busca en la base por si el titular ya existia).
  const titularIdByAffiliateNumber = new Map<string, number>();

  for (let i = 0; i < dataRows.length; i++) {
    const excelRowNumber = i + 2; // +2 porque la fila 1 es encabezado y Excel arranca en 1
    const cells = dataRows[i];
    if (!cells || cells.every((c) => c === undefined || c === "")) continue;

    const raw = {} as RawRow;
    COLUMNS.forEach((key, idx) => {
      (raw as any)[key] = cells[idx];
    });

    const affiliateNumber = toText(raw.affiliateNumber);
    const fullName = toText(raw.fullName);
    const dni = toText(raw.dni);
    const parentesco = toText(raw.parentesco);
    const isDependentRow = !!parentesco && parentesco.toLowerCase() !== "titular";

    if (!affiliateNumber) {
      result.errors.push({ row: excelRowNumber, reason: "Falta el Nº de Asociado" });
      continue;
    }
    if (!fullName) {
      result.errors.push({ row: excelRowNumber, reason: "Falta Apellido y Nombre" });
      continue;
    }

    const registryStatus = toText(raw.registryStatus);
    const isBaja = registryStatus?.toUpperCase().includes("BAJA");

    if (!isDependentRow) {
      // Fila de titular.
      if (!dni) {
        result.errors.push({ row: excelRowNumber, reason: "Falta el DNI del titular" });
        continue;
      }

      const { firstName, lastName, warning } = splitFullName(fullName);
      if (warning) result.errors.push({ row: excelRowNumber, reason: warning });

      const companyId = await resolveCompanyId(toText(raw.companyName));

      const data = {
        affiliateNumber,
        firstName,
        lastName,
        dni,
        cuil: toText(raw.cuil),
        birthDate: toDate(raw.birthDate),
        address: toText(raw.address),
        floorApt: toText(raw.floorApt),
        locality: toText(raw.locality),
        province: toText(raw.province),
        phone: toText(raw.phone),
        email: toText(raw.email),
        status: isBaja ? "inactive" : "active",
        companyId,
        yacimiento: toText(raw.yacimiento),
        puesto: toText(raw.puesto),
        companyEntryDate: toDate(raw.companyEntryDate),
        leaveDate1: toDate(raw.leaveDate1),
        reEntryDate: toDate(raw.reEntryDate),
        leaveDate2: toDate(raw.leaveDate2),
        activeNote: toText(raw.activeNote),
        healthProvider: toText(raw.healthProvider),
        coveragePercentage: toText(raw.coveragePercentage),
        healthProviderEntryDate: toDate(raw.healthProviderEntryDate),
        registryStatus,
      };

      try {
        const existing = await prisma.affiliate.findUnique({ where: { affiliateNumber } });
        let affiliate;
        if (existing) {
          affiliate = await prisma.affiliate.update({ where: { id: existing.id }, data });
          result.titularsUpdated++;
        } else {
          affiliate = await prisma.affiliate.create({ data });
          result.titularsCreated++;
          await logAffiliateEvent({
            affiliateId: affiliate.id,
            eventType: "affiliate_created",
            description: `Alta de afiliado ${affiliate.firstName} ${affiliate.lastName} (importado desde planilla)`,
            createdByUserId: userId,
          });
        }
        titularIdByAffiliateNumber.set(affiliateNumber, affiliate.id);
      } catch (err: any) {
        result.errors.push({ row: excelRowNumber, reason: `No se pudo guardar: ${err.message || err}` });
      }
    } else {
      // Fila de familiar a cargo: se busca el titular por Nº de Asociado
      // (primero en lo ya procesado en esta importacion, despues en la base).
      let titularId = titularIdByAffiliateNumber.get(affiliateNumber);
      if (!titularId) {
        const titular = await prisma.affiliate.findUnique({ where: { affiliateNumber } });
        if (titular) titularId = titular.id;
      }

      if (!titularId) {
        result.errors.push({
          row: excelRowNumber,
          reason: `No se encontró el titular con Nº de Asociado ${affiliateNumber} para asociar a este familiar`,
        });
        continue;
      }

      const data = {
        affiliateId: titularId,
        fullName,
        dni,
        cuil: toText(raw.cuil),
        parentesco: parentesco!,
        birthDate: toDate(raw.birthDate),
        healthProvider: toText(raw.healthProvider),
        coveragePercentage: toText(raw.coveragePercentage),
        healthProviderEntryDate: toDate(raw.healthProviderEntryDate),
        registryStatus,
        address: toText(raw.address),
        floorApt: toText(raw.floorApt),
        locality: toText(raw.locality),
        province: toText(raw.province),
        phone: toText(raw.phone),
        email: toText(raw.email),
      };

      try {
        // Se identifica un familiar ya importado por titular + DNI (si tiene
        // DNI) para no duplicarlo si se vuelve a importar la misma planilla.
        const existing = dni
          ? await prisma.dependent.findFirst({ where: { affiliateId: titularId, dni } })
          : null;

        if (existing) {
          await prisma.dependent.update({ where: { id: existing.id }, data });
          result.dependentsUpdated++;
        } else {
          await prisma.dependent.create({ data });
          result.dependentsCreated++;
        }
      } catch (err: any) {
        result.errors.push({ row: excelRowNumber, reason: `No se pudo guardar el familiar: ${err.message || err}` });
      }
    }
  }

  await logAudit({
    userId,
    action: "create",
    entityType: "affiliate_import",
    afterData: result,
  });

  return result;
}
