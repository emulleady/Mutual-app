import { PrismaClient } from "@prisma/client";

// Instancia unica del cliente de Prisma para toda la app.
export const prisma = new PrismaClient();
