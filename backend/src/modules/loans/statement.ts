import { prisma } from "../../db";

const TZ = "America/Argentina/Buenos_Aires";

// Dia de cierre configurado (1-31) o null si no hay.
export async function getClosingDay(): Promise<number | null> {
  const row = await prisma.statementSetting.findUnique({ where: { id: 1 } });
  return row?.closingDay ?? null;
}

// Cuantos meses se corre la primera cuota de una orden: 1 si se hizo despues
// del dia de cierre (pasa al resumen siguiente), 0 si no. Si el dia de cierre
// es mayor a los dias del mes (ej. 31 en abril), se toma el ultimo dia del mes.
export function statementShift(grantedAt: Date, closingDay: number | null): number {
  if (!closingDay) return 0;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(grantedAt)
    .split("-")
    .map(Number);
  const [year, month, day] = parts;
  const daysInMonth = new Date(year, month, 0).getDate();
  const effectiveClosing = Math.min(closingDay, daysInMonth);
  return day > effectiveClosing ? 1 : 0;
}
