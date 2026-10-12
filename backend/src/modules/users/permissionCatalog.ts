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
];

export async function ensurePermissionsExist(): Promise<void> {
  const existing = await prisma.permission.findMany({ select: { key: true } });
  const have = new Set(existing.map((p: any) => p.key));
  for (const key of ALL_PERMISSION_KEYS) {
    if (!have.has(key)) {
      await prisma.permission.create({ data: { key } });
    }
  }
}
