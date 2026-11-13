import { prisma } from "../../db";

// Catalogo completo de permisos del sistema. Al listar permisos se crean
// en la base los que falten, asi un permiso nuevo aparece en la pantalla
// de Roles sin necesidad de correr el seed en produccion.
export const ALL_PERMISSION_KEYS = [
  "affiliates.create",
  "affiliates.edit",
  "affiliates.view",
  "affiliates.deactivate",
  "users.manage",
  "audit.view",
  "settings.manage",
  "companies.manage",
  "orders.delete",
  "orders.setDate",
  "agreements.manage",
  "inventory.manage",
  "finance.manage",
  "orders.view",
  "companies.view",
  "agreements.view",
  "inventory.view",
  "finance.view",
  "settings.view",
];

export async function ensurePermissionsExist(): Promise<void> {
  const existing = await prisma.permission.findMany({ select: { key: true } });
  const have = new Set(existing.map((p: any) => p.key));
  for (const key of ALL_PERMISSION_KEYS) {
    if (!have.has(key)) {
      const created = await prisma.permission.create({ data: { key } });
      // "Ver órdenes de compra" es nuevo: para que los roles existentes sigan
      // viendo lo que veían, se les otorga al crearse. Se exceptúan los roles
      // de Farmacia, que no deben ver órdenes de compra.
      if (key === "orders.view") {
        const roles = await prisma.role.findMany();
        for (const role of roles) {
          if (/farmacia/i.test(role.name)) continue;
          await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: created.id } });
        }
      }
    }
  }
}
