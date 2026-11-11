// Lee los permisos del usuario logueado (guardados al iniciar sesion).
// El Administrador siempre tiene todo. Esto solo decide que se muestra:
// el backend vuelve a exigir cada permiso en cada pedido.
export function hasPermission(key: string): boolean {
  try {
    if (localStorage.getItem("role") === "Administrador") return true;
    const permissions: string[] = JSON.parse(localStorage.getItem("permissions") || "[]");
    return permissions.includes(key);
  } catch {
    return false;
  }
}

export const can = hasPermission;

// "Ver" lo tiene quien puede ver o quien puede gestionar el área.
export const canView = (area: string) => hasPermission(`${area}.view`) || hasPermission(`${area}.manage`);
