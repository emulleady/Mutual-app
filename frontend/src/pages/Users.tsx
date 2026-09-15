import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", fullName: "", roleId: "" });
  const [error, setError] = useState<string | null>(null);

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
              <td>{u.role}</td>
              <td><span className={`badge badge-${u.active ? "active" : "inactive"}`}>{u.active ? "activo" : "inactivo"}</span></td>
              <td style={{ display: "flex", gap: 8 }}>
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
