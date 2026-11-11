import { useEffect, useState } from "react";
import { api } from "../api/client";
import { permissionLabels, translate } from "../utils/labels";

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", fullName: "", roleId: "" });
  const [error, setError] = useState<string | null>(null);

  const [editingPermissionsFor, setEditingPermissionsFor] = useState<any | null>(null);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  function load() {
    api.listUsers().then(setUsers).catch(() => {});
    api.listRoles().then(setRoles).catch(() => {});
  }
  useEffect(load, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createUser({ ...form, roleId: Number(form.roleId) });
      setShowForm(false);
      setForm({ username: "", password: "", fullName: "", roleId: "" });
      load();
    } catch (err: any) {
      setError(err.message || "No se pudo crear el usuario");
    }
  }

  async function handleToggle(id: number) {
    try {
      await api.toggleUserActive(id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleReset(id: number) {
    const password = window.prompt("Nueva contraseña (mínimo 8 caracteres)");
    if (!password) return;
    try {
      await api.resetUserPassword(id, password);
      alert("Contraseña actualizada.");
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleChangeRole(user: any, roleId: number) {
    if (roleId === user.roleId) return;
    const role = roles.find((r) => r.id === roleId);
    if (!window.confirm(`¿Cambiar el rol de ${user.fullName} a "${role?.name}"?`)) return;
    try {
      await api.changeUserRole(user.id, roleId);
    } catch (err: any) {
      alert(err.message || "No se pudo cambiar el rol");
    }
    load();
  }

  async function openPermissions(user: any) {
    setEditingPermissionsFor(user);
    const perms = await api.getUserPermissions(user.id);
    // "on" = estado final que tendrá la persona (rol + extras − quitados).
    setPermissions(perms.map((p: any) => ({ ...p, on: (p.fromRole && !p.denied) || p.fromUser })));
  }

  function togglePermission(key: string) {
    setPermissions((prev) =>
      prev.map((p) => (p.key === key ? { ...p, on: !p.on } : p))
    );
  }

  async function savePermissions() {
    setPermissionsSaving(true);
    try {
      // Tildado y el rol no lo da → permiso extra. Destildado y el rol sí lo da → permiso quitado.
      const keys = permissions.filter((p) => p.on && !p.fromRole).map((p) => p.key);
      const deny = permissions.filter((p) => !p.on && p.fromRole).map((p) => p.key);
      await api.setUserPermissions(editingPermissionsFor.id, keys, deny);
      setEditingPermissionsFor(null);
    } catch (err: any) {
      alert(err.message || "No se pudieron guardar los permisos");
    } finally {
      setPermissionsSaving(false);
    }
  }

  if (editingPermissionsFor) {
    return (
      <div>
        <button className="link-button-dark" onClick={() => setEditingPermissionsFor(null)}>
          ← Volver a usuarios
        </button>
        <h1>Permisos de {editingPermissionsFor.fullName}</h1>
        <p className="note">
          Rol actual: {editingPermissionsFor.role}. Los permisos del rol vienen tildados de
          entrada: destildá los que NO querés que tenga esta persona, o tildá los que quieras
          sumarle, aunque su rol no los incluya. El cambio vale solo para este usuario (la
          próxima vez que inicie sesión). El Administrador siempre tiene todo.
        </p>
        <table className="data-table">
          <thead><tr><th></th><th>Permiso</th><th>Estado</th></tr></thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={p.key}>
                <td>
                  <input
                    type="checkbox"
                    checked={!!p.on}
                    disabled={editingPermissionsFor.role === "Administrador"}
                    onChange={() => togglePermission(p.key)}
                  />
                </td>
                <td>{translate(permissionLabels, p.key)}</td>
                <td>
                  {p.fromRole && !p.on ? <span className="badge badge-inactive">quitado</span>
                    : !p.fromRole && p.on ? <span className="badge badge-active">extra</span>
                    : p.fromRole ? "por rol" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={{ marginTop: 16 }} onClick={savePermissions} disabled={permissionsSaving}>
          {permissionsSaving ? "Guardando..." : "Guardar permisos"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Usuarios</h1>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancelar" : "Nuevo usuario"}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate}>
          <input placeholder="Usuario" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input placeholder="Nombre completo" value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <input placeholder="Contraseña provisoria" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} required>
            <option value="">Rol...</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {error && <div className="error-box">{error}</div>}
          <button type="submit">Crear usuario</button>
        </form>
      )}

      <table className="data-table">
        <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.fullName}</td>
              <td>
                <select value={u.roleId} onChange={(e) => handleChangeRole(u, Number(e.target.value))}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </td>
              <td><span className={`badge badge-${u.active ? "active" : "inactive"}`}>{u.active ? "activo" : "inactivo"}</span></td>
              <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="small-button" onClick={() => openPermissions(u)}>Permisos</button>
                <button className="small-button" onClick={() => handleReset(u.id)}>Restablecer contraseña</button>
                <button className="small-button" onClick={() => handleToggle(u.id)}>
                  {u.active ? "Desactivar" : "Activar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
