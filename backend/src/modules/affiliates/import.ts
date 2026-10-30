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
  "membershipDate",       // Y - Fecha de alta real (opcional)
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

export function toText(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export function toDate(value: any): Date | undefined {
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

// ---- Lectura por NOMBRE de columna ---------------------------------
// La planilla real puede traer una cantidad variable de columnas (por
// ejemplo, varios pares "FECHA BAJA / FECHA ALTA NUEVA"). Por eso se
// identifica cada dato por el titulo de su columna y no por su posicion.
// Si no se reconocen los titulos, se usa el orden fijo A-Y de arriba.
function normHeader(h: any): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

type Mapped = RawRow & { bajas: any[]; altas: any[] };

export function buildMapper(header: any[]): ((cells: any[]) => Mapped) | null {
  const single: Record<string, number> = {};
  const bajaIdx: number[] = [];
  const altaIdx: number[] = [];
  let fechaIngresoSeen = 0;

  header.forEach((h, idx) => {
    const n = normHeader(h);
    if (!n) return;
    const set = (key: string) => { if (single[key] === undefined) single[key] = idx; };
    if (n === "NASOCIADO" || n === "NROASOCIADO" || n === "NUMEROASOCIADO" || n === "ASOCIADO") set("affiliateNumber");
    else if (n === "APELLIDOYNOMBRE" || n === "APELLIDONOMBRE" || n === "NOMBREYAPELLIDO") set("fullName");
    else if (n === "DNI") set("dni");
    else if (n === "CUIL" || n === "CUIT") set("cuil");
    else if (n === "EMPRESA") set("companyName");
    else if (n === "YACIMIENTO") set("yacimiento");
    else if (n === "PUESTO") set("puesto");
    else if (n === "FECHAINGRESO") {
      // la primera es la de la empresa, la segunda la de la obra social
      fechaIngresoSeen++;
      set(fechaIngresoSeen === 1 ? "companyEntryDate" : "healthProviderEntryDate");
    }
    else if (n === "FECHABAJA" || n === "BAJA") bajaIdx.push(idx);
    else if (n.startsWith("FECHAALTANUEV") || n === "FECHAALTA" || n === "ALTANUEVA" || n === "ALTANUEVO") altaIdx.push(idx);
    else if (n === "FECHAALTAREAL" || n === "FECHADEALTAREAL" || n === "FECHAASOCIACION") set("membershipDate");
    else if (n === "ACTIVOS") set("activeNote");
    else if (n === "PARENTESCO") set("parentesco");
    else if (n === "FECHANAC" || n === "FECHANACIMIENTO") set("birthDate");
    else if (n === "OBRASOCIAL") set("healthProvider");
    else if (n.startsWith("AL") && n.includes("100")) set("coveragePercentage");
    else if (n === "ESTADO") set("registryStatus");
    else if (n === "DOMICILIO" || n === "DIRECCION") set("address");
    else if (n === "PISOYDPTO" || n === "PISO") set("floorApt");
    else if (n === "LOCALIDAD") set("locality");
    else if (n === "PROVINCIA") set("province");
    else if (n === "TELEFONO" || n === "TEL" || n === "CELULAR") set("phone");
    else if (n === "EMAIL" || n === "CORREO" || n === "MAIL") set("email");
  });

  // Si no se reconocen al menos los datos basicos, se descarta este metodo.
  if (single.affiliateNumber === undefined || single.fullName === undefined) return null;

  return (cells: any[]) => {
    const raw: any = {};
    for (const key of COLUMNS) raw[key] = single[key] !== undefined ? cells[single[key]] : undefined;
    raw.bajas = bajaIdx.map((i) => cells[i]);
    raw.altas = altaIdx.map((i) => cells[i]);
    return raw as Mapped;
  };
}

export function positionalMapper(cells: any[]): Mapped {
  const raw: any = {};
  COLUMNS.forEach((key, idx) => { raw[key] = cells[idx]; });
  raw.bajas = [raw.leaveDate1, raw.leaveDate2];
  raw.altas = [raw.reEntryDate];
  return raw as Mapped;
}

// Periodos [alta, baja] a partir de ingreso + pares baja/alta nueva.
export function buildPeriodRanges(entry: Date | undefined, bajas: (Date | undefined)[], altas: (Date | undefined)[]) {
  const starts: (Date | undefined)[] = [entry, ...altas];
  const out: { startDate: Date; endDate: Date | null }[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    if (!start) continue;
    out.push({ startDate: start, endDate: bajas[i] ?? null });
  }
  return out;
}

export function splitFullNameSmart(fullName: string): { firstName: string; lastName: string; warning?: string } {
  if (fullName.includes(",")) return splitFullName(fullName);
  // Sin coma: "APELLIDO NOMBRE" (formato de la planilla de la mutual).
  const t = fullName.trim().split(/\s+/);
  if (t.length === 1) return { lastName: t[0], firstName: "", warning: "Nombre con una sola palabra, revisar." };
  const surnameCount = t.length <= 3 ? 1 : 2;
  return {
    lastName: t.slice(0, surnameCount).join(" "),
    firstName: t.slice(surnameCount).join(" "),
    warning: t.length >= 4 ? "Apellido/nombre separados automáticamente (se asumieron 2 apellidos), revisar si hace falta." : undefined,
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
  const mapRow = buildMapper(rows[0] || []) ?? positionalMapper;

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

    const raw = mapRow(cells);

    const affiliateNumber = toText(raw.affiliateNumber);
    const fullName = toText(raw.fullName);
    const dni = toText(raw.dni);
    const parentesco = toText(raw.parentesco);
    // "NNNN/00" = titular, "NNNN/01", "/02"... = familiares. Si el numero no
    // tiene sufijo, se decide por el texto de Parentesco (los numeros
    // sueltos que trae esa columna en la planilla se ignoran).
    const suffix = affiliateNumber?.includes("/") ? affiliateNumber.split("/")[1].trim() : undefined;
    const parentescoIsText = !!parentesco && !/^\d+$/.test(parentesco) && parentesco.toLowerCase() !== "titular";
    const isDependentRow = suffix !== undefined ? !/^0+$/.test(suffix) : parentescoIsText;

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

      const { firstName, lastName, warning } = splitFullNameSmart(fullName);
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
        leaveDate1: toDate(raw.bajas[0]),
        reEntryDate: toDate(raw.altas[0]),
        leaveDate2: toDate(raw.bajas[1]),
        activeNote: toText(raw.activeNote),
        healthProvider: toText(raw.healthProvider),
        coveragePercentage: toText(raw.coveragePercentage),
        healthProviderEntryDate: toDate(raw.healthProviderEntryDate),
        registryStatus,
      };
      // Fecha real de alta: solo se pisa si la planilla la trae.
      const membershipDate = toDate(raw.membershipDate);
      const dataWithAlta = membershipDate ? { ...data, membershipDate } : data;

      try {
        const existing = await prisma.affiliate.findUnique({ where: { affiliateNumber } });
        let affiliate;
        if (existing) {
          affiliate = await prisma.affiliate.update({ where: { id: existing.id }, data: dataWithAlta });
          result.titularsUpdated++;
        } else {
          affiliate = await prisma.affiliate.create({ data: dataWithAlta });
          result.titularsCreated++;
          await logAffiliateEvent({
            affiliateId: affiliate.id,
            eventType: "affiliate_created",
            description: `Alta de afiliado ${affiliate.firstName} ${affiliate.lastName} (importado desde planilla)`,
            createdByUserId: userId,
          });
        }
        // Periodos de pertenencia: solo si el asociado todavia no tiene
        // (nunca se pisan los que ya se cargaron o editaron).
        const hasPeriods = await prisma.affiliateMembershipPeriod.count({ where: { affiliateId: affiliate.id } });
        if (hasPeriods === 0) {
          let ranges = buildPeriodRanges(
            data.companyEntryDate,
            raw.bajas.map(toDate),
            raw.altas.map(toDate)
          );
          if (ranges.length === 0) {
            ranges = [{ startDate: membershipDate ?? new Date(), endDate: isBaja ? new Date() : null }];
          }
          for (const r of ranges) {
            await prisma.affiliateMembershipPeriod.create({
              data: { affiliateId: affiliate.id, companyId: affiliate.companyId, startDate: r.startDate, endDate: r.endDate },
            });
          }
        }
        titularIdByAffiliateNumber.set(affiliateNumber, affiliate.id);
      } catch (err: any) {
        result.errors.push({ row: excelRowNumber, reason: `No se pudo guardar: ${err.message || err}` });
      }
    } else {
      // Fila de familiar a cargo: se busca el titular por Nº de Asociado
      // (primero en lo ya procesado en esta importacion, despues en la base).
      const base = affiliateNumber.split("/")[0].trim();
      const candidates = [`${base}/00`, affiliateNumber, base];
      let titularId: number | undefined;
      for (const c of candidates) {
        titularId = titularIdByAffiliateNumber.get(c);
        if (titularId) break;
      }
      if (!titularId) {
        const titular = await prisma.affiliate.findFirst({ where: { affiliateNumber: { in: candidates } } });
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
        dependentNumber: affiliateNumber,
        parentesco: parentescoIsText ? parentesco! : `Familiar ${suffix ?? ""}`.trim(),
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
        const existing =
          (dni ? await prisma.dependent.findFirst({ where: { affiliateId: titularId, dni } }) : null) ??
          (await prisma.dependent.findFirst({ where: { affiliateId: titularId, dependentNumber: affiliateNumber } }));

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
