import { prisma } from "../../db";
import { recalculateOverdueInstallments } from "../loans/mora";

export interface CompanyReportRow {
  // Número de asociado + sufijo: "00" para el titular, "01", "02"... para
  // cada familiar a cargo, en el orden en que fueron cargados.
  affiliateNumber: string;
  fullName: string;
  dni: string;
  parentesco: string; // "Titular" para el socio, o el parentesco del familiar
  status: string; // solo se completa en la fila del titular
  healthProvider: string;
  coveragePercentage: string;
  totalDebt: number; // solo se completa en la fila del titular
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
// prestamos activos) de cada afiliado que trabaja en la empresa, y agrega
// debajo de cada uno sus familiares a cargo (numerados 00/01/02...).
export async function buildCompanyReport(companyId: number): Promise<CompanyReport | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      affiliates: {
        where: { status: "active" }, // solo se liquida a los activos
        orderBy: { lastName: "asc" },
        include: { dependents: { orderBy: { id: "asc" } } },
      },
    },
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
      affiliateNumber: `${affiliate.affiliateNumber.split("/")[0]}/00`,
      fullName: `${affiliate.lastName}, ${affiliate.firstName}`,
      dni: affiliate.dni,
      parentesco: "Titular",
      status: statusLabels[affiliate.status] || affiliate.status,
      healthProvider: affiliate.healthProvider || "",
      coveragePercentage: affiliate.coveragePercentage || "",
      totalDebt: Number(totalDebt.toFixed(2)),
    });

    affiliate.dependents.forEach((dep, idx) => {
      rows.push({
        affiliateNumber: dep.dependentNumber || `${affiliate.affiliateNumber.split("/")[0]}/${String(idx + 1).padStart(2, "0")}`,
        fullName: dep.fullName,
        dni: dep.dni || "",
        parentesco: dep.parentesco,
        status: "",
        healthProvider: dep.healthProvider || affiliate.healthProvider || "",
        coveragePercentage: dep.coveragePercentage || affiliate.coveragePercentage || "",
        totalDebt: 0,
      });
    });
  }

  return { companyName: company.name, generatedAt: new Date(), rows };
}
