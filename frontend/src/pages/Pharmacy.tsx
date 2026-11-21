import { useState } from "react";
import { api } from "../api/client";

type Discount = { medicines: number; products: number } | null;

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-block", padding: "4px 12px", borderRadius: 6, fontWeight: 700,
        color: "#fff", background: active ? "#1e9e57" : "#c0392b",
      }}
    >
      {active ? "ACTIVO" : "NO ACTIVO"}
    </span>
  );
}

function DiscountCell({ active, discount }: { active: boolean; discount: Discount }) {
  if (!active) return <span className="note">Sin descuento</span>;
  if (!discount) return <span className="note">Descuento sin cargar</span>;
  return (
    <span>
      Medicamentos <b>{discount.medicines}%</b> · Productos de farmacia <b>{discount.products}%</b>
    </span>
  );
}

export default function Pharmacy() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (q.trim().length < 3) {
      setError("Escribí al menos 3 caracteres (DNI, N° de asociado o apellido).");
      return;
    }
    setLoading(true);
    try {
      setResults(await api.pharmacyLookup(q.trim()));
    } catch (err: any) {
      setError(err.message || "No se pudo consultar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Farmacia · Consulta de asociado</h1>
      <p className="note">Buscá por DNI, N° de asociado o apellido para ver si está activo y qué descuento le corresponde, a él y a su familia.</p>
      <form className="inline-form" onSubmit={search}>
        <input
          autoFocus
          placeholder="DNI, N° de asociado o apellido"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 280 }}
        />
        <button type="submit" disabled={loading}>{loading ? "Buscando..." : "Consultar"}</button>
      </form>
      {error && <div className="error-box">{error}</div>}

      {results && results.length === 0 && <p>No se encontró ningún asociado con ese dato.</p>}

      {results?.map((a) => (
        <div key={a.id} className="card" style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h2 style={{ margin: 0 }}>{a.name}</h2>
              <div className="note">DNI {a.dni} · N° {a.affiliateNumber} · {a.socioType}</div>
            </div>
            <StatusBadge active={a.active} />
          </div>
          <p style={{ margin: "10px 0" }}><DiscountCell active={a.active} discount={a.discount} /></p>

          {a.dependents.length > 0 && (
            <table className="data-table">
              <thead><tr><th>Familiar</th><th>Parentesco</th><th>DNI</th><th>Estado</th><th>Descuento</th></tr></thead>
              <tbody>
                {a.dependents.map((d: any) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.parentesco}</td>
                    <td>{d.dni || "—"}</td>
                    <td><StatusBadge active={d.active} /></td>
                    <td><DiscountCell active={d.active} discount={d.discount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
