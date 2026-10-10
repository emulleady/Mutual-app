import { useEffect, useState } from "react";
import { api } from "../api/client";
import { permissionLabels, translate } from "../utils/labels";

type RoleForm = { id: number | null; name: string; description: string; permissionKeys: string[] };

const EMPTY_FORM: RoleForm = { id: null, name: "", description: "", permissionKeys: [] };

export default function Roles() {
  const [roles, setRoles] = useState<any[]>([]);
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [form, setForm] = useState<RoleForm | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.listRoles().then(setRoles).catch(() => {});
    api.listPermissionKeys().then(setAllKeys).catch(() => {});
  }
  useEffect(load, []);

  function startCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setError(null);
  }

  function startEdit(role: any) {
    setEditing(role);
    setForm({
      id: role.id,
      name: role.name,
      description: role.description || "",
      permissionKeys: [...role.permissionKeys],
    });
    setError(null);
  }

  function toggleKey(key: string) {
    if (!form) return;
    setForm({
      ...form,
      permissionKeys: form.permissionKeys.includes(key)
        ? form.permissionKeys.filter((k) => k !== key)
        : [...form.permissionKeys, key],
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        permissionKeys: form.permissionKeys,
      };
      if (form.id) {
        await api.updateRole(form.id, payload);
      } else {
        await api.createRole(payload);
      }
      setForm(null);
      setEditing(null);
      load();
    } catch (err: any) {
      setError(err.message || "No se pudo guardar el rol");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: any) {
    if (!window.confirm(`¿Borrar el rol "${role.name}"? Esto no se puede deshacer.`)) return;
    try {
      await api.deleteRole(role.id);
      load();
    } catch (err: any) {
      alert(err.message || "No se pudo borrar el rol");
    }
  }

  if (form) {
    const isSystem = !!editing?.isSystem;
    return (
      <div>
        <button className="link-button-dark" onClick={() => { setForm(null); setEditing(null); }}>
          ← Volver a roles
        </button>
        <h1>{form.id ? `Editar rol: ${editing?.name}` : "Nuevo rol"}</h1>
        <p className="note">
          Tildá lo que va a poder hacer cualquier usuario con este rol. Los cambios se aplican
          la próxima vez que esa persona inicie sesión.
        </p>

        <form onSubmit={handleSave} style={{ maxWidth: 560 }}>
          <label>Nombre del rol</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={isSystem}
            required
          />
          <label>Descripción (opcional)</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Ej: Atiende mostrador, solo consulta"
          />

          <h3 style={{ marginTop: 20 }}>Permisos</h3>
          <table className="data-table">
            <tbody>
              {allKeys.map((key) => (
                <tr key={key}>
                  <td style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={form.permissionKeys.includes(key)}
                      onChange={() => toggleKey(key)}
                    />
                  </td>
                  <td>{translate(permissionLabels, key)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
          <button type="submit" style={{ marginTop: 16 }} disabled={saving}>
            {saving ? "Guardando..." : "Guardar rol"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Roles y permisos</h1>
        <button onClick={startCreate}>Nuevo rol</button>
      </div>
      <p className="note">
        Un rol es un conjunto de permisos. Creá los roles que necesites y asignáselos a cada
        usuario desde la pantalla Usuarios. El rol Administrador siempre tiene acceso total.
      </p>

      <table className="data-table">
        <thead>
          <tr><th>Rol</th><th>Permisos</th><th>Usuarios</th><th></th></tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                {r.description && <div style={{ fontSize: 12, opacity: 0.75 }}>{r.description}</div>}
              </td>
              <td>
                {r.isAdmin
                  ? "Acceso total"
                  : r.permissionKeys.length === 0
                  ? "—"
                  : r.permissionKeys.map((k: string) => translate(permissionLabels, k)).join(", ")}
              </td>
              <td>{r.userCount}</td>
              <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!r.isAdmin && (
                  <button className="small-button" onClick={() => startEdit(r)}>Editar</button>
                )}
                {!r.isSystem && (
                  <button className="small-button" onClick={() => handleDelete(r)}>Borrar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
