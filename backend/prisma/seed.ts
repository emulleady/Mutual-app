import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const branch = await prisma.branch.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "Casa Central" },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: "Administrador" },
    update: {},
    create: { name: "Administrador", description: "Acceso total al sistema" },
  });

  const secretarioRole = await prisma.role.upsert({
    where: { name: "Secretario" },
    update: {},
    create: {
      name: "Secretario",
      description: "Consulta y carga de afiliados, sin configuracion critica",
    },
  });

  const permissionKeys = [
    "affiliates.create",
    "affiliates.edit",
    "affiliates.view",
    "affiliates.deactivate",
    "users.manage",
    "audit.view",
    "settings.manage",
    "companies.manage",
  ];

  for (const key of permissionKeys) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }

  const allPermissions = await prisma.permission.findMany();
  for (const p of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: p.id },
    });
  }

  const secretarioPermissionKeys = ["affiliates.create", "affiliates.edit", "affiliates.view"];
  for (const key of secretarioPermissionKeys) {
    const p = allPermissions.find((x) => x.key === key)!;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: secretarioRole.id, permissionId: p.id } },
      update: {},
      create: { roleId: secretarioRole.id, permissionId: p.id },
    });
  }

  const passwordHash = await bcrypt.hash("Admin123!", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash,
      fullName: "Administrador del Sistema",
      roleId: adminRole.id,
      branchId: branch.id,
    },
  });

  console.log("Seed completo. Usuario: admin / Contraseña: Admin123!");
  console.log("*** Cambiar esta contraseña despues del primer login. ***");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
