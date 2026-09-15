import { prisma } from "../../db";

// Devuelve la tasa de interes vigente en este momento (la que no tiene
// effectiveTo, o cuyo rango cubre "ahora"). Si el administrador no cargo
// ninguna tasa todavia, no se calcula mora (se deja en 0) en vez de asumir
// un valor por default no autorizado.
async function getEffectiveRate(atDate: Date) {
  return prisma.interestRateSettings.findFirst({
    where: {
      effectiveFrom: { lte: atDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: atDate } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

// Recorre las cuotas pendientes de un prestamo, marca como "overdue" las
// que ya vencieron, y (re)calcula el interes acumulado usando la tasa
// vigente al momento del vencimiento de cada cuota. Se llama al consultar
// la ficha/prestamo (calculo bajo demanda), no por un proceso en segundo
// plano, para mantener el MVP simple.
export async function recalculateOverdueInstallments(loanId: number) {
  const installments = await prisma.loanInstallment.findMany({
    where: { loanId, status: { in: ["pending", "overdue"] } },
  });

  const now = new Date();

  for (const inst of installments) {
    if (inst.dueDate >= now) continue; // todavia no vencio

    if (inst.status !== "overdue") {
      await prisma.loanInstallment.update({
        where: { id: inst.id },
        data: { status: "overdue" },
      });
    }

    const rate = await getEffectiveRate(inst.dueDate);
    if (!rate) continue; // sin tasa cargada, no se calcula penalidad

    const daysOverdue = Math.floor((now.getTime() - inst.dueDate.getTime()) / 86_400_000);
    const outstanding = inst.amount - inst.paidAmount;
    const dailyRate = rate.rateType === "daily" ? rate.rateValue : rate.rateValue / 30;
    const penaltyAmount = Number((outstanding * (dailyRate / 100) * daysOverdue).toFixed(2));

    const existing = await prisma.loanInstallmentPenalty.findFirst({
      where: { loanInstallmentId: inst.id },
      orderBy: { calculatedAt: "desc" },
    });

    if (!existing || existing.daysOverdue !== daysOverdue) {
      await prisma.loanInstallmentPenalty.create({
        data: {
          loanInstallmentId: inst.id,
          interestRateSettingsId: rate.id,
          daysOverdue,
          penaltyAmount,
        },
      });
    }
  }
}
