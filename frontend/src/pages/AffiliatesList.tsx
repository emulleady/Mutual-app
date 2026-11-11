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
  const [viewMode, setViewMode] = useState<"normal" | "altas">("normal");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<any>({});
  const navigate = useNavigate();

  const setFilter = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const activeFilterCount = Object.values(filters).filter((v) => v).length;

  function load() {
    api
      .listAffiliates({ ...filters, sort: viewMode === "altas" ? "altas" : undefined, status: statusFilter || undefined })
      .then(setAffiliates)
      .catch(() => {});
  }

  // El texto libre espera un momento a que termines de escribir.
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [viewMode, statusFilter, filters]);
  useEffect(() => { api.affiliateFilterOptions().then(setOptions).catch(() => {}); }, []);

  function exportCsv() {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["N° asociado", "Apellido", "Nombre", "DNI", "CUIL", "Empresa", "Tipo de socio", "Obra social", "Cobertura", "Localidad", "Teléfono", "Email", "Estado"];
    const rows = affiliates.map((a) => [a.affiliateNumber, a.lastName, a.firstName, a.dni, a.cuil, a.company?.name, a.socioType, a.healthProvider, a.coveragePercentage, a.locality, a.phone, a.email, translate(affiliateStatusLabels, a.status)]);
    const csv = "\ufeff" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "asociados-filtrados.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  const sel = (key: string, label: string, list: string[] = []) => (
    <select value={filters[key] || ""} onChange={(e) => setFilter(key, e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      {list.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  );
  const yesNo = (key: string, label: string) => (
    <select value={filters[key] || ""} onChange={(e) => setFilter(key, e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      <option value="yes">Sí</option>
      <option value="no">No</option>
    </select>
  );
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
      setError(err.message || "No se pudo crear el asociado");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{viewMode === "altas" ? "Todas las altas" : "Asociados"}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} aria-label="Filtrar por estado">
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <button className="small-button" onClick={() => setShowFilters((v) => !v)}>
            Filtros{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
          <button
            className="small-button"
            onClick={() => setViewMode((v) => (v === "altas" ? "normal" : "altas"))}
          >
            {viewMode === "altas" ? "Volver al listado" : "Ver todas las altas"}
          </button>
          <label className="small-button" style={{ cursor: "pointer" }}>
            {importing ? "Importando..." : "Importar Excel"}
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={importing} style={{ display: "none" }} />
          </label>
          <button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancelar" : "Nuevo asociado"}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="tab-panel" style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
            <input style={{ gridColumn: "span 2" }} placeholder="Buscar: nombre, DNI, CUIL, N°, teléfono, email, domicilio, familiar"
              value={filters.q || ""} onChange={(e) => setFilter("q", e.target.value)} />
            <select value={filters.companyId || ""} onChange={(e) => setFilter("companyId", e.target.value)} aria-label="Empresa">
              <option value="">Empresa</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {yesNo("withoutCompany", "¿Sin empresa?")}
            {sel("socioType", "Tipo de socio", options.socioTypes)}
            {sel("healthProvider", "Obra social", options.healthProviders)}
            {sel("coveragePercentage", "Cobertura", options.coverages)}
            {sel("locality", "Localidad", options.localities)}
            {sel("province", "Provincia", options.provinces)}
            {sel("yacimiento", "Yacimiento", options.yacimientos)}
            {sel("puesto", "Puesto", options.puestos)}
            {sel("registryStatus", "Estado en planilla", options.registryStatuses)}
            <select value={filters.branchId || ""} onChange={(e) => setFilter("branchId", e.target.value)} aria-label="Sucursal">
              <option value="">Sucursal</option>
              {(options.branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {yesNo("withDependents", "¿Con familiares?")}
            {yesNo("withPendingOrders", "¿Con órdenes pendientes?")}
            {yesNo("withMedife", "¿Con cuota Medife?")}
            <label style={{ fontSize: 12 }}>Alta desde
              <input type="date" value={filters.altaFrom || ""} onChange={(e) => setFilter("altaFrom", e.target.value)} />
            </label>
            <label style={{ fontSize: 12 }}>Alta hasta
              <input type="date" value={filters.altaTo || ""} onChange={(e) => setFilter("altaTo", e.target.value)} />
            </label>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button className="small-button" onClick={() => setFilters({})}>Limpiar filtros</button>
            <button className="small-button" onClick={exportCsv}>Exportar lista a Excel (CSV)</button>
          </div>
        </div>
      )}

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
          <input placeholder="N° de asociado" value={form.affiliateNumber}
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

      <p className="note">{affiliates.length} asociado(s){statusFilter === "active" ? " activo(s)" : statusFilter === "inactive" ? " inactivo(s)" : ""}</p>

      <table className="data-table">
        <thead>
          <tr>
            <th>N°</th><th>Apellido y nombre</th><th>DNI</th><th>Empresa</th><th>Tipo de socio</th><th>Obra social</th><th>Estado</th>
            {viewMode === "altas" && <th>Fecha de alta</th>}
          </tr>
        </thead>
        <tbody>
          {affiliates.map((a) => (
            <tr key={a.id} className="clickable-row" onClick={() => navigate(`/afiliados/${a.id}`)}>
              <td>{a.affiliateNumber}</td>
              <td>{a.lastName}, {a.firstName}</td>
              <td>{a.dni}</td>
              <td>{a.company?.name || "—"}</td>
              <td>{a.socioType || "—"}</td>
              <td>{a.healthProvider || "—"}</td>
              <td><span className={`badge badge-${a.status}`}>{translate(affiliateStatusLabels, a.status)}</span></td>
              {viewMode === "altas" && (
                <td>{new Date(a.membershipDate || a.createdAt).toLocaleDateString("es-AR")}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
