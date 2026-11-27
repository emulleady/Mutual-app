import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

const SPORT_TYPES = ["Socio Deportivo", "Adherente Socio Deportivo"];

export default function Sports() {
  const [type, setType] = useState(SPORT_TYPES[0]);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api
      .listAffiliates({ socioType: type, status: "active", q: q.trim() || undefined })
      .then(setRows)
      .catch((e: any) => setError(e.message || "No se pudo cargar"));
  }, [type, q]);

  return (
    <div>
      <h1>Deporte</h1>
      <p className="note">Asociados activos con tipo de socio deportivo.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de socio">
          {SPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Buscar por nombre, DNI o N°" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
      </div>
      {error && <div className="error-box">{error}</div>}
      <p className="note">{rows.length} asociado(s)</p>
      <table className="data-table">
        <thead><tr><th>N°</th><th>Apellido y nombre</th><th>DNI</th><th>Empresa</th><th>Tipo de socio</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{a.affiliateNumber}</td>
              <td><Link to={`/afiliados/${a.id}`}>{a.lastName} {a.firstName}</Link></td>
              <td>{a.dni}</td>
              <td>{a.company?.name || "—"}</td>
              <td>{a.socioType}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5}>No hay asociados con ese tipo de socio.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
