import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { affiliateStatusLabels, translate } from "../utils/labels";

export default function Companies() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", cuit: "", address: "", phone: "", contactName: "" });
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  function load() {
    api.listCompanies().then(setCompanies).catch(() => {});
  }
  useEffect(load, []);

  async function openCompany(id: number) {
    const detail = await api.getCompany(id);
    setSelected(detail);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createCompany(form);
      setShowForm(false);
      setForm({ name: "", cuit: "", address: "", phone: "", contactName: "" });
      load();
    } catch (err: any) {
      setError(err.message || "No se pudo crear la empresa");
    }
  }

  async function handleToggle(id: number) {
    await api.toggleCompanyActive(id);
    load();
    if (selected?.id === id) openCompany(id);
  }

  if (selected) {
    return (
      <div>
        <button className="link-button-dark" onClick={() => setSelected(null)}>← Volver a empresas</button>
        <div className="page-header">
          <h1>{selected.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className={`badge badge-${selected.active ? "active" : "inactive"}`}>
              {selected.active ? "Activa" : "Inactiva"}
            </span>
            <button className="small-button" onClick={() => api.downloadCompanyReportExcel(selected.id, selected.name)}>
              Descargar Excel
            </button>
            <button className="small-button" onClick={() => api.downloadCompanyReportPdf(selected.id, selected.name)}>
              Descargar PDF
            </button>
          </div>
        </div>
        <dl className="data-list" style={{ marginBottom: 24 }}>
          <dt>CUIT</dt><dd>{selected.cuit || "—"}</dd>
          <dt>Dirección</dt><dd>{selected.address || "—"}</dd>
          <dt>Teléfono</dt><dd>{selected.phone || "—"}</dd>
          <dt>Contacto</dt><dd>{selected.contactName || "—"}</dd>
        </dl>

        <h3>Afiliados que trabajan en esta empresa ({selected.affiliates.length})</h3>
        <table className="data-table">
          <thead><tr><th>N°</th><th>Apellido y nombre</th><th>DNI</th><th>Estado</th></tr></thead>
          <tbody>
            {selected.affiliates.map((a: any) => (
              <tr key={a.id} className="clickable-row" onClick={() => navigate(`/afiliados/${a.id}`)}>
                <td>{a.affiliateNumber}</td>
                <td>{a.lastName}, {a.firstName}</td>
                <td>{a.dni}</td>
                <td><span className={`badge badge-${a.status}`}>{translate(affiliateStatusLabels, a.status)}</span></td>
              </tr>
            ))}
            {selected.affiliates.length === 0 && (
              <tr><td colSpan={4}>Todavía no hay afiliados cargados con esta empresa.</td></tr>
            )}
          </tbody>
        </table>

        <p className="note" style={{ marginTop: 16 }}>
          Los beneficios en los que esta empresa figure como proveedor se van a listar acá
          cuando se incorpore el módulo de beneficios.
        </p>

        <button className="small-button" style={{ marginTop: 16 }} onClick={() => handleToggle(selected.id)}>
          {selected.active ? "Desactivar empresa" : "Activar empresa"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Empresas</h1>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancelar" : "Nueva empresa"}</button>
      </div>
      <p className="note">
        Empresas donde trabajan los afiliados, usadas para el descuento por recibo de sueldo.
      </p>

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate}>
          <input placeholder="Nombre de la empresa" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="CUIT" value={form.cuit}
            onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
          <input placeholder="Dirección" value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input placeholder="Teléfono" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Contacto (nombre)" value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          {error && <div className="error-box">{error}</div>}
          <button type="submit">Guardar</button>
        </form>
      )}

      <table className="data-table">
        <thead><tr><th>Nombre</th><th>CUIT</th><th>Contacto</th><th>Teléfono</th><th>Estado</th></tr></thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.id} className="clickable-row" onClick={() => openCompany(c.id)}>
              <td>{c.name}</td>
              <td>{c.cuit || "—"}</td>
              <td>{c.contactName || "—"}</td>
              <td>{c.phone || "—"}</td>
              <td><span className={`badge badge-${c.active ? "active" : "inactive"}`}>{c.active ? "Activa" : "Inactiva"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
