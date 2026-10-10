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
  affiliate: "Asociado",
  affiliate_import: "Importación de asociados",
  loan: "Orden de compra",
  loan_payment: "Pago de orden de compra",
  interest_rate_settings: "Tasa de mora",
  company: "Empresa",
  user: "Usuario",
  dependent: "Familiar a cargo",
};

export const permissionLabels: Record<string, string> = {
  "affiliates.create": "Crear asociados",
  "affiliates.edit": "Editar asociados",
  "affiliates.view": "Ver asociados",
  "affiliates.deactivate": "Dar de baja / reactivar asociados",
  "users.manage": "Gestionar usuarios y permisos",
  "audit.view": "Ver auditoría",
  "settings.manage": "Gestionar configuración (tasa de mora, numeración)",
  "companies.manage": "Gestionar empresas",
  "orders.delete": "Eliminar órdenes de compra",
  "agreements.manage": "Gestionar convenios (empresas y comercios)",
  "inventory.manage": "Gestionar inventario y préstamos de artículos",
};

export function translate(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}
