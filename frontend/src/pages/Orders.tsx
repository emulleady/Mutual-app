import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { loanStatusLabels, translate } from "../utils/labels";

const money = (n: number) => `$${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: any) => (d ? new Date(d).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "—");

// Módulo de consulta de órdenes de compra: solo ver y filtrar.
export default function Orders() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [companies, setCompanies] = useState<any[]>([]);
  const [data, setData] = useState<any>({ rows: [], totals: { count: 0, amount: 0, balance: 0 }, truncated: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setFilter = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  useEffect(() => { api.listCompanies().then(setCompanies).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      api.listLoans(filters).then(setData).catch((e: any) => setError(e.message || "No se pudieron cargar las órdenes"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);

  function exportCsv() {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["N° orden", "Fecha", "N° asociado", "Asociado", "DNI", "Empresa", "Comercio", "Importe", "Cuotas", "Valor cuota", "Pagadas", "Saldo", "Próx. vencimiento", "Estado"];
    const rows = data.rows.map((r: any) => [r.orderNumber, date(r.grantedAt), r.affiliate.affiliateNumber, `${r.affiliate.lastName}, ${r.affiliate.firstName}`, r.affiliate.dni, r.affiliate.company?.name, r.comercio, r.amount, r.installmentsCount, r.installmentValue, r.paidCount, r.balance, date(r.nextDueDate), translate(loanStatusLabels, r.status)]);
    const csv = "﻿" + [header, ...rows].map((r: any[]) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "ordenes-de-compra.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Órdenes de compra</h1>
        <button className="small-button" onClick={exportCsv} disabled={data.rows.length === 0}>Exportar a Excel (CSV)</button>
      </div>
      <p className="note">Consulta de todas las órdenes. Para modificar una orden, entrá a la ficha del asociado.</p>

      <div className="tab-panel" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
          <input placeholder="N° de orden" value={filters.orderNumber || ""} onChange={(e) => setFilter("orderNumber", e.target.value)} />
          <input placeholder="Asociado: nombre, DNI o N°" value={filters.affiliate || ""} onChange={(e) => setFilter("affiliate", e.target.value)} />
          <select value={filters.companyId || ""} onChange={(e) => setFilter("companyId", e.target.value)}>
            <option value="">Empresa</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Comercio" value={filters.comercio || ""} onChange={(e) => setFilter("comercio", e.target.value)} />
          <select value={filters.status || ""} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">Estado</option>
            {Object.entries(loanStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filters.pending || ""} onChange={(e) => setFilter("pending", e.target.value)}>
            <option value="">¿Con saldo pendiente?</option>
            <option value="yes">Con cuotas impagas</option>
            <option value="no">Totalmente pagadas</option>
          </select>
          <input type="number" min="1" placeholder="Cantidad de cuotas" value={filters.installments || ""} onChange={(e) => setFilter("installments", e.target.value)} />
          <input type="number" min="0" placeholder="Importe desde $" value={filters.amountMin || ""} onChange={(e) => setFilter("amountMin", e.target.value)} />
          <input type="number" min="0" placeholder="Importe hasta $" value={filters.amountMax || ""} onChange={(e) => setFilter("amountMax", e.target.value)} />
          <label style={{ fontSize: 12 }}>Fecha de orden desde
            <input type="date" value={filters.dateFrom || ""} onChange={(e) => setFilter("dateFrom", e.target.value)} /></label>
          <label style={{ fontSize: 12 }}>Fecha de orden hasta
            <input type="date" value={filters.dateTo || ""} onChange={(e) => setFilter("dateTo", e.target.value)} /></label>
          <label style={{ fontSize: 12 }}>Cuota vence desde
            <input type="date" value={filters.dueFrom || ""} onChange={(e) => setFilter("dueFrom", e.target.value)} /></label>
          <label style={{ fontSize: 12 }}>Cuota vence hasta
            <input type="date" value={filters.dueTo || ""} onChange={(e) => setFilter("dueTo", e.target.value)} /></label>
        </div>
        <button className="small-button" style={{ marginTop: 10 }} onClick={() => setFilters({})}>Limpiar filtros</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      <p className="note">
        {loading ? "Cargando..." : `${data.totals.count} orden(es) · importe total ${money(data.totals.amount)} · saldo pendiente ${money(data.totals.balance)}`}
        {data.truncated && " · se muestran las primeras 1000, afiná los filtros para ver el resto"}
      </p>

      <table className="data-table">
        <thead>
          <tr>
            <th>N° orden</th><th>Fecha</th><th>Asociado</th><th>Empresa</th><th>Comercio</th>
            <th>Importe</th><th>Cuotas</th><th>Pagadas</th><th>Saldo</th><th>Próx. venc.</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r: any) => (
            <tr key={r.id} className="clickable-row" onClick={() => navigate(`/afiliados/${r.affiliate.id}`)}>
              <td>{r.orderNumber || r.id}</td>
              <td>{date(r.grantedAt)}</td>
              <td>{r.affiliate.lastName}, {r.affiliate.firstName}<br /><small>{r.affiliate.affiliateNumber} · DNI {r.affiliate.dni}</small></td>
              <td>{r.affiliate.company?.name || "—"}</td>
              <td>{r.comercio}</td>
              <td>{money(r.amount)}</td>
              <td>{r.installmentsCount} × {money(r.installmentValue)}</td>
              <td>{r.paidCount}/{r.installmentsCount}</td>
              <td>{money(r.balance)}</td>
              <td>{date(r.nextDueDate)}</td>
              <td>{translate(loanStatusLabels, r.status)}</td>
            </tr>
          ))}
          {!loading && data.rows.length === 0 && <tr><td colSpan={11}>No hay órdenes con esos filtros.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
