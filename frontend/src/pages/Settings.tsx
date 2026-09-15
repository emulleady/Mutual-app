import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Settings() {
  const [rates, setRates] = useState<any[]>([]);
  const [rateType, setRateType] = useState<"daily" | "monthly">("monthly");
  const [rateValue, setRateValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.getInterestRates().then(setRates).catch(() => {});
  }
  useEffect(load, []);

  const current = rates.find((r) => !r.effectiveTo);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.setInterestRate({ rateType, rateValue: Number(rateValue) });
      setRateValue("");
      load();
    } catch (err: any) {
      setError(err.message || "No se pudo guardar la tasa");
    }
  }

  return (
    <div>
      <h1>Configuración — Tasa de interés por mora</h1>
      <p>
        {current
          ? `Tasa vigente: ${current.rateValue}% ${current.rateType === "daily" ? "diario" : "mensual"} (desde ${new Date(current.effectiveFrom).toLocaleDateString("es-AR")})`
          : "No hay ninguna tasa cargada todavía — no se calculará mora hasta que se defina una."}
      </p>

      <form className="inline-form" onSubmit={handleSubmit}>
        <select value={rateType} onChange={(e) => setRateType(e.target.value as "daily" | "monthly")}>
          <option value="daily">Diaria</option>
          <option value="monthly">Mensual</option>
        </select>
        <input
          placeholder="Porcentaje, ej. 2.5"
          type="number"
          step="0.01"
          value={rateValue}
          onChange={(e) => setRateValue(e.target.value)}
          required
        />
        {error && <div className="error-box">{error}</div>}
        <button type="submit">Guardar nueva tasa</button>
      </form>

      <h2 style={{ marginTop: 24 }}>Historial de tasas</h2>
      <table className="data-table">
        <thead><tr><th>Tipo</th><th>Valor</th><th>Desde</th><th>Hasta</th></tr></thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.id}>
              <td>{r.rateType === "daily" ? "Diaria" : "Mensual"}</td>
              <td>{r.rateValue}%</td>
              <td>{new Date(r.effectiveFrom).toLocaleDateString("es-AR")}</td>
              <td>{r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString("es-AR") : "Vigente"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
