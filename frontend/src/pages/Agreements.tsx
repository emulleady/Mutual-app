import { useEffect, useState } from "react";
import { api } from "../api/client";

type Kind = "empresa" | "comercio";

export default function Agreements() {
  const [kind, setKind] = useState<Kind>("empresa");
  const [agreements, setAgreements] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", details: "" });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  function load() {
    api.listAgreements(kind).then(setAgreements).catch(() => {});
  }
  useEffect(load, [kind]);

  function startCreate() {
    setEditingId(null);
    setForm({ name: "", details: "" });
    setShowForm(true);
  }

  function startEdit(a: any) {
    setEditingId(a.id);
    setForm({ name: a.name, details: a.details || "" });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api.updateAgreement(editingId, form);
      } else {
        await api.createAgreement({ ...form, kind });
      }
      setShowForm(false);
      setForm({ name: "", details: "" });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.message || "No se pudo guardar el convenio");
    }
  }

  async function handleToggle(id: number) {
    await api.toggleAgreementActive(id);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Convenios</h1>
        <button onClick={startCreate}>{showForm && !editingId ? "Cancelar" : `Nuevo convenio con ${kind === "empresa" ? "empresa" : "comercio"}`}</button>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button
          className={kind === "empresa" ? "active" : ""}
          onClick={() => { setKind("empresa"); setShowForm(false); }}
        >
          Empresas
        </button>
        <button
          className={kind === "comercio" ? "active" : ""}
          onClick={() => { setKind("comercio"); setShowForm(false); }}
        >
          Comercios
        </button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleSubmit} style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 520 }}>
          <label>Nombre {kind === "empresa" ? "de la empresa" : "del comercio"}</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <label>Condiciones del convenio</label>
          <textarea
            rows={4}
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
            placeholder="Ej: 15% de descuento en indumentaria, válido hasta diciembre de 2026"
          />
          {error && <div className="error-box">{error}</div>}
          <button type="submit">Guardar</button>
        </form>
      )}

      <table className="data-table">
        <thead><tr><th>Nombre</th><th>Condiciones</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {agreements.map((a) => (
            <tr key={a.id}>
              <td className="clickable-row" onClick={() => startEdit(a)}>{a.name}</td>
              <td>{a.details || "—"}</td>
              <td><span className={`badge badge-${a.active ? "active" : "inactive"}`}>{a.active ? "Vigente" : "Dado de baja"}</span></td>
              <td>
                <button className="small-button" onClick={() => handleToggle(a.id)}>
                  {a.active ? "Dar de baja" : "Reactivar"}
                </button>
              </td>
            </tr>
          ))}
          {agreements.length === 0 && (
            <tr><td colSpan={4}>Todavía no hay convenios cargados con {kind === "empresa" ? "empresas" : "comercios"}.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
