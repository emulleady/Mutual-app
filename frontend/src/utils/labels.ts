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
  role: "Rol",
  user_permissions: "Permisos de usuario",
  agreement: "Convenio",
  inventory_item: "Artículo de inventario",
  inventory_loan: "Préstamo de inventario",
};

export const permissionLabels: Record<string, string> = {
  "affiliates.create": "Crear asociados",
  "affiliates.edit": "Editar asociados",
  "affiliates.view": "Ver asociados",
  "affiliates.deactivate": "Dar de baja / reactivar asociados",
  "users.manage": "Gestionar usuarios y permisos",
  "audit.view": "Ver auditoría",
  "settings.manage": "Configuración: ver y modificar (tasa de mora, numeración, cuotas, servicios)",
  "companies.manage": "Empresas: ver y modificar",
  "orders.delete": "Eliminar órdenes de compra",
  "orders.setDate": "Cambiar la fecha y el número de una orden de compra",
  "agreements.manage": "Convenios: ver y modificar (empresas y comercios)",
  "inventory.manage": "Inventario: ver y modificar (artículos y préstamos)",
  "finance.manage": "Cobranzas y Caja: ver y modificar (ingresos, egresos, cobranzas)",
  "finance.view": "Cobranzas y Caja: solo ver",
  "orders.view": "Órdenes de compra: ver el módulo de consulta",
  "companies.view": "Empresas: solo ver (liquidaciones y reportes)",
  "agreements.view": "Convenios: solo ver",
  "inventory.view": "Inventario: solo ver",
  "settings.view": "Configuración: solo ver",
};

export function translate(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}
