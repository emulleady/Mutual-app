import { prisma } from "../../db";

const TZ = "America/Argentina/Buenos_Aires";

// Dia de cierre configurado (1-31) o null si no hay.
export async function getClosingDay(): Promise<number | null> {
  const row = await prisma.statementSetting.findUnique({ where: { id: 1 } });
  return row?.closingDay ?? null;
}

// Meses desde el mes de la orden hasta su primera cuota. Con dia de cierre:
// 0 si la orden se hizo hasta el dia de cierre (entra a la liquidacion de ese
// mismo mes) y 1 si fue despues (liquidacion del mes siguiente). Sin dia de
// cierre configurado: 1 (la primera cuota vence el mes siguiente). Si el dia de cierre
// es mayor a los dias del mes (ej. 31 en abril), se toma el ultimo dia del mes.
export function statementShift(grantedAt: Date, closingDay: number | null): number {
  if (!closingDay) return 1;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(grantedAt)
    .split("-")
    .map(Number);
  const [year, month, day] = parts;
  const daysInMonth = new Date(year, month, 0).getDate();
  const effectiveClosing = Math.min(closingDay, daysInMonth);
  return day > effectiveClosing ? 1 : 0;
}
