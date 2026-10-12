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
