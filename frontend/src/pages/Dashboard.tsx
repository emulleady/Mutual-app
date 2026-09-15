import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Dashboard() {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(() => {});
  }, []);

  if (!data) return <p>Cargando...</p>;

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="cards-grid">
        <div className="stat-card">
          <span className="stat-value">{data.totalAffiliates}</span>
          <span className="stat-label">Afiliados totales</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.activeAffiliates}</span>
          <span className="stat-label">Afiliados activos</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.inactiveAffiliates}</span>
          <span className="stat-label">Afiliados inactivos</span>
        </div>
      </div>

      <h2>Operaciones recientes</h2>
      <table className="data-table">
        <thead>
          <tr><th>Fecha</th><th>Afiliado</th><th>Descripción</th></tr>
        </thead>
        <tbody>
          {data.recentEvents.map((e: any) => (
            <tr key={e.id}>
              <td>{new Date(e.occurredAt).toLocaleString("es-AR")}</td>
              <td>{e.affiliateName}</td>
              <td>{e.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
