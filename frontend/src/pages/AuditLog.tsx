import { useEffect, useState } from "react";
import { api } from "../api/client";
import { auditActionLabels, auditEntityLabels, translate } from "../utils/labels";

export default function AuditLog() {
  const [data, setData] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [filters, setFilters] = useState({ userId: "", entityType: "", dateFrom: "", dateTo: "" });
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    api.listUsers().then(setUsers).catch(() => {});
    api.getAuditEntityTypes().then(setEntityTypes).catch(() => {});
  }, []);

  function load() {
    const params: Record<string, string> = { page: String(page) };
    if (filters.userId) params.userId = filters.userId;
    if (filters.entityType) params.entityType = filters.entityType;
    if (filters.dateFrom) params.dateFrom = new Date(filters.dateFrom).toISOString();
    if (filters.dateTo) params.dateTo = new Date(filters.dateTo).toISOString();
    api.getAuditLogs(params).then(setData).catch(() => {});
  }

  useEffect(load, [page]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <h1>Auditoría</h1>
      <p className="note">
        Registro de solo lectura: nadie puede editar ni borrar estas entradas, ni siquiera el administrador.
      </p>

      <form className="inline-form" onSubmit={applyFilters}>
        <select value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })}>
          <option value="">Todos los usuarios</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
        <select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}>
          <option value="">Todos los tipos</option>
          {entityTypes.map((t) => <option key={t} value={t}>{translate(auditEntityLabels, t)}</option>)}
        </select>
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
        <button type="submit">Filtrar</button>
      </form>

      <table className="data-table">
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Tipo</th><th>ID</th><th></th></tr></thead>
        <tbody>
          {(data?.logs || []).map((log: any) => (
            <>
              <tr key={log.id} className="clickable-row" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                <td>{new Date(log.createdAt).toLocaleString("es-AR")}</td>
                <td>{log.userName}</td>
                <td>{translate(auditActionLabels, log.action)}</td>
                <td>{translate(auditEntityLabels, log.entityType)}</td>
                <td>{log.entityId ?? "—"}</td>
                <td>{expandedId === log.id ? "▲" : "▼"}</td>
              </tr>
              {expandedId === log.id && (
                <tr key={`${log.id}-detail`}>
                  <td colSpan={6}>
                    <div style={{ fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                      {log.beforeData && <p><strong>Antes:</strong> {JSON.stringify(log.beforeData)}</p>}
                      {log.afterData && <p><strong>Después:</strong> {JSON.stringify(log.afterData)}</p>}
                      {log.ipAddress && <p><strong>IP:</strong> {log.ipAddress}</p>}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
          {data && data.logs.length === 0 && <tr><td colSpan={6}>Sin resultados para estos filtros.</td></tr>}
        </tbody>
      </table>

      {data && data.total > data.pageSize && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
          <button className="small-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span>Página {page} de {totalPages}</span>
          <button className="small-button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  );
}
