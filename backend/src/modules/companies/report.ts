import { prisma } from "../../db";
import { recalculateOverdueInstallments } from "../loans/mora";

export interface CompanyReportRow {
  affiliateNumber: string;
  fullName: string;
  dni: string;
  status: string;
  totalDebt: number;
}

export interface CompanyReport {
  companyName: string;
  generatedAt: Date;
  rows: CompanyReportRow[];
}

const statusLabels: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
  suspended: "Suspendido",
};

// Arma el estado y la deuda total (saldo pendiente + mora acumulada de
// prestamos activos) de cada afiliado que trabaja en la empresa.
export async function buildCompanyReport(companyId: number): Promise<CompanyReport | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { affiliates: { orderBy: { lastName: "asc" } } },
  });
  if (!company) return null;

  const rows: CompanyReportRow[] = [];

  for (const affiliate of company.affiliates) {
    const loans = await prisma.loan.findMany({
      where: { affiliateId: affiliate.id, status: { in: ["active", "overdue", "pending", "approved"] } },
    });

    let totalDebt = 0;
    for (const loan of loans) {
      await recalculateOverdueInstallments(loan.id);
      const installments = await prisma.loanInstallment.findMany({
        where: { loanId: loan.id },
        include: { penalties: { orderBy: { calculatedAt: "desc" }, take: 1 } },
      });
      for (const inst of installments) {
        totalDebt += inst.amount - inst.paidAmount;
        totalDebt += inst.penalties[0]?.penaltyAmount || 0;
      }
    }

    rows.push({
      affiliateNumber: affiliate.affiliateNumber,
      fullName: `${affiliate.lastName}, ${affiliate.firstName}`,
      dni: affiliate.dni,
      status: statusLabels[affiliate.status] || affiliate.status,
      totalDebt: Number(totalDebt.toFixed(2)),
    });
  }

  return { companyName: company.name, generatedAt: new Date(), rows };
}
