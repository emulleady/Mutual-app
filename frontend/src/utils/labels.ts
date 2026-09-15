// Traducciones centralizadas de los estados que vienen del backend en
// inglés (para no repetir el mapeo en cada pantalla).

export const affiliateStatusLabels: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
  suspended: "Suspendido",
};

export const loanStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  active: "Activo",
  overdue: "En mora",
  cancelled: "Cancelado",
  rejected: "Rechazado",
};

export const installmentStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  paid: "Paga",
  overdue: "Impaga (en mora)",
};

export const userStatusLabels: Record<string, string> = {
  true: "Activo",
  false: "Inactivo",
};

export const auditActionLabels: Record<string, string> = {
  create: "Creó",
  update: "Modificó",
  delete: "Eliminó",
  login: "Inició sesión",
};

export const auditEntityLabels: Record<string, string> = {
  affiliate: "Afiliado",
  affiliate_import: "Importación de afiliados",
  loan: "Préstamo",
  loan_payment: "Pago de préstamo",
  interest_rate_settings: "Tasa de mora",
  company: "Empresa",
  user: "Usuario",
  dependent: "Familiar a cargo",
};

export function translate(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}
