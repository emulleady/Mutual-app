import { prisma } from "../db";

// Registra una entrada de auditoria. Se llama explicitamente desde cada
// controller que hace una escritura (create/update/delete logico), para
// que quede claro en el codigo que operacion se esta auditando y con
// que datos. Ningun endpoint permite editar o borrar filas de esta tabla.
export async function logAudit(params: {
  userId?: number;
  action: "create" | "update" | "delete" | "login";
  entityType: string;
  entityId?: number;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeData: params.beforeData ? JSON.stringify(params.beforeData) : undefined,
      afterData: params.afterData ? JSON.stringify(params.afterData) : undefined,
      ipAddress: params.ipAddress,
    },
  });
}

// Registra un evento de negocio en la linea de tiempo del afiliado
// (distinto de la auditoria tecnica: esto es lo que ve el secretario
// en la pestaña "Historial" de la ficha).
export async function logAffiliateEvent(params: {
  affiliateId: number;
  eventType: string;
  description: string;
  referenceTable?: string;
  referenceId?: number;
  createdByUserId?: number;
}) {
  await prisma.affiliateEvent.create({
    data: {
      affiliateId: params.affiliateId,
      eventType: params.eventType,
      description: params.description,
      referenceTable: params.referenceTable,
      referenceId: params.referenceId,
      createdByUserId: params.createdByUserId,
    },
  });
}
