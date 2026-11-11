import { useState } from "react";
import { api } from "../api/client";

type Props = {
  items: any[];            // servicios ya asignados (con serviceType)
  catalog: any[];          // catálogo de servicios activos
  affiliateId?: number;    // si es del titular
  dependentId?: number;    // si es de un familiar
  onChanged: () => void;
};

const money = (n: number) => `$${Number(n).toLocaleString("es-AR")}`;

// Lista desplegable "Servicios": muestra los servicios de la persona, cada
// uno con su costo propio (editable), y permite sumar otros del catálogo.
export default function ServicesEditor({ items, catalog, affiliateId, dependentId, onChanged }: Props) {
  const [picking, setPicking] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const assignedTypeIds = new Set(items.map((s) => s.serviceTypeId));
  const available = catalog.filter((t) => !assignedTypeIds.has(t.id));

  async function run(fn: () => Promise<any>) {
    setError(null);
    try { await fn(); onChanged(); } catch (e: any) { setError(e.message || "No se pudo guardar"); }
  }

  function pick(value: string) {
    const id = value ? Number(value) : "";
    setPicking(id);
    const t = catalog.find((c) => c.id === id);
    setAmount(t ? String(t.defaultAmount) : "");
  }

  return (
    <div style={{ minWidth: 190 }}>
      {items.map((s) => (
        <div key={s.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, fontSize: 12 }}>
          <span style={{ flex: 1 }}>{s.serviceType?.name}</span>
          {editingId === s.id ? (
            <>
              <input type="number" step="0.01" min="0" value={editAmount} style={{ width: 80 }}
                onChange={(e) => setEditAmount(e.target.value)} />
              <button className="small-button" onClick={() => run(async () => {
                await api.updatePersonService(s.id, Number(editAmount || 0));
                setEditingId(null);
              })}>OK</button>
            </>
          ) : (
            <>
              <b style={{ cursor: "pointer" }} title="Cambiar costo"
                onClick={() => { setEditingId(s.id); setEditAmount(String(s.amount)); }}>{money(s.amount)}</b>
              <button className="small-button" title="Quitar servicio"
                onClick={() => run(() => api.removePersonService(s.id))}>✕</button>
            </>
          )}
        </div>
      ))}

      <select value={picking} onChange={(e) => pick(e.target.value)} style={{ maxWidth: 190 }}>
        <option value="">{items.length ? "+ Agregar servicio" : "Servicios"}</option>
        {available.map((t) => <option key={t.id} value={t.id}>{t.name} ({money(t.defaultAmount)})</option>)}
      </select>
      {picking !== "" && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input type="number" step="0.01" min="0" placeholder="Costo" value={amount} style={{ width: 90 }}
            onChange={(e) => setAmount(e.target.value)} />
          <button className="small-button" onClick={() => run(async () => {
            await api.assignService({ serviceTypeId: picking, affiliateId, dependentId, amount: Number(amount || 0) });
            setPicking(""); setAmount("");
          })}>Agregar</button>
        </div>
      )}
      {error && <div className="error-box" style={{ marginTop: 4 }}>{error}</div>}
    </div>
  );
}
