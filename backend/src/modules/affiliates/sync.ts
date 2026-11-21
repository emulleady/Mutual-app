import { prisma } from "../../db";

// Regla: si el titular no esta activo, sus familiares tampoco. Se marcan como
// "dados de baja junto con el titular" para reactivarlos cuando el titular
// vuelva. Se corre al iniciar y despues de importar una planilla, para cubrir
// titulares que quedaron en baja por una importacion o antes de que existiera
// la baja en cascada. Es idempotente y no borra nada.
export async function syncDependentsWithTitular(): Promise<number> {
  const res = await prisma.dependent.updateMany({
    where: { active: true, affiliate: { status: { not: "active" } } },
    data: { active: false, deactivatedWithTitular: true },
  });
  return res.count;
}
