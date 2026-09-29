// Script de uso único: resetea la contraseña del usuario "admin" a
// Admin123!. Correr con: npx ts-node reset-admin-password.ts
// Después de usarlo, se puede borrar este archivo sin problema.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 10);
  const updated = await prisma.user.update({
    where: { username: "admin" },
    data: { passwordHash },
  });
  console.log(`Contraseña de "${updated.username}" restablecida a: Admin123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
