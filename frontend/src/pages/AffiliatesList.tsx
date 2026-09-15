import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { affiliateStatusLabels, translate } from "../utils/labels";

export default function AffiliatesList() {
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    affiliateNumber: "",
    firstName: "",
    lastName: "",
    dni: "",
    phone: "",
    email: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const navigate = useNavigate();

  function load() {
    api.listAffiliates().then(setAffiliates).catch(() => {});
  }

  useEffect(load, []);
  useEffect(() => { api.listCompanies().then(setCompanies).catch(() => {}); }, []);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await api.importAffiliates(file);
      setImportResult(result);
      load();
    } catch (err: any) {
      setImportError(err.message || "No se pudo importar el archivo");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createAffiliate({ ...form, companyId: companyId ? Number(companyId) : null });
      setShowForm(false);
      setForm({ affiliateNumber: "", firstName: "", lastName: "", dni: "", phone: "", email: "" });
      setCompanyId("");
      load();
    } catch (err: any) {
      setError(err.message || "No se pudo crear el afiliado");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Afiliados</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <label className="small-button" style={{ cursor: "pointer" }}>
            {importing ? "Importando..." : "Importar Excel"}
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={importing} style={{ display: "none" }} />
          </label>
          <button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancelar" : "Nuevo afiliado"}
          </button>
        </div>
      </div>

      {importError && <div className="error-box" style={{ marginBottom: 16 }}>{importError}</div>}

      {importResult && (
        <div className="tab-panel" style={{ marginBottom: 16 }}>
          <p>
            Titulares: {importResult.titularsCreated} nuevos, {importResult.titularsUpdated} actualizados.{" "}
            Familiares: {importResult.dependentsCreated} nuevos, {importResult.dependentsUpdated} actualizados.
          </p>
          {importResult.errors.length > 0 && (
            <>
              <p style={{ fontWeight: 600, marginTop: 12 }}>
                {importResult.errors.length} fila(s) con observaciones:
              </p>
              <ul className="timeline">
                {importResult.errors.map((e: any, idx: number) => (
                  <li key={idx}><span className="timeline-date">Fila {e.row}</span><span>{e.reason}</span></li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate}>
          <input placeholder="N° de afiliado" value={form.affiliateNumber}
            onChange={(e) => setForm({ ...form, affiliateNumber: e.target.value })} required />
          <input placeholder="Nombre" value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          <input placeholder="Apellido" value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          <input placeholder="DNI" value={form.dni}
            onChange={(e) => setForm({ ...form, dni: e.target.value })} required />
          <input placeholder="Teléfono" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Empresa donde trabaja (opcional)</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {error && <div className="error-box">{error}</div>}
          <button type="submit">Guardar</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr><th>N°</th><th>Apellido y nombre</th><th>DNI</th><th>Estado</th></tr>
        </thead>
        <tbody>
          {affiliates.map((a) => (
            <tr key={a.id} className="clickable-row" onClick={() => navigate(`/afiliados/${a.id}`)}>
              <td>{a.affiliateNumber}</td>
              <td>{a.lastName}, {a.firstName}</td>
              <td>{a.dni}</td>
              <td><span className={`badge badge-${a.status}`}>{translate(affiliateStatusLabels, a.status)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
