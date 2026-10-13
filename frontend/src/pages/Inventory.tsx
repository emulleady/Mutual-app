import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

const money = (n: number) =>
  (n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

const currentMonth = () => new Date().toISOString().slice(0, 7);

const EMPTY_ITEM = { name: "", quantity: "", unitValue: "", trackKm: false };

export default function Inventory() {
  const [items, setItems] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<any | null>(null);

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [itemError, setItemError] = useState<string | null>(null);

  const [purchaseItem, setPurchaseItem] = useState<any | null>(null);
  const [purchaseForm, setPurchaseForm] = useState({ quantity: "1", unitCost: "", notes: "", updateUnitValue: true });
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const [showLoanForm, setShowLoanForm] = useState(false);
  const [loanForm, setLoanForm] = useState({
    itemId: "",
    quantity: "1",
    kmOut: "",
    borrowerType: "asociado" as "asociado" | "otro",
    affiliateId: "",
    affiliateQuery: "",
    borrowerName: "",
    notes: "",
  });
  const [loanError, setLoanError] = useState<string | null>(null);

  function loadItems() {
    api.listInventoryItems().then(setItems).catch(() => {});
  }
  function loadLoans() {
    api.listInventoryLoans(showActiveOnly ? { active: true } : undefined).then(setLoans).catch(() => {});
  }
  function loadSummary() {
    api.getInventorySummary(month).then(setSummary).catch(() => {});
  }
  function reloadAll() {
    loadItems();
    loadLoans();
    loadSummary();
  }

  useEffect(loadItems, []);
  useEffect(loadLoans, [showActiveOnly]);
  useEffect(loadSummary, [month]);
  useEffect(() => { api.listAffiliates().then(setAffiliates).catch(() => {}); }, []);

  const filteredAffiliates = useMemo(() => {
    const q = loanForm.affiliateQuery.trim().toLowerCase();
    if (!q) return [];
    return affiliates
      .filter(
        (a) =>
          `${a.lastName} ${a.firstName}`.toLowerCase().includes(q) ||
          a.dni?.includes(q) ||
          a.affiliateNumber?.includes(q)
      )
      .slice(0, 8);
  }, [loanForm.affiliateQuery, affiliates]);

  const selectedAffiliate = affiliates.find((a) => String(a.id) === loanForm.affiliateId);
  const loanItem = items.find((it) => String(it.id) === loanForm.itemId);

  // ---- Artículos ----
  function startCreateItem() {
    setEditingItemId(null);
    setItemForm(EMPTY_ITEM);
    setItemError(null);
    setShowItemForm(true);
  }

  function startEditItem(it: any) {
    setEditingItemId(it.id);
    setItemForm({
      name: it.name,
      quantity: String(it.quantity),
      unitValue: it.unitValue ? String(it.unitValue) : "",
      trackKm: !!it.trackKm,
    });
    setItemError(null);
    setShowItemForm(true);
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    setItemError(null);
    const payload = {
      name: itemForm.name,
      quantity: Number(itemForm.quantity),
      unitValue: Number(itemForm.unitValue) || 0,
      trackKm: itemForm.trackKm,
    };
    try {
      if (editingItemId) {
        await api.updateInventoryItem(editingItemId, payload);
      } else {
        await api.createInventoryItem(payload);
      }
      setItemForm(EMPTY_ITEM);
      setEditingItemId(null);
      setShowItemForm(false);
      reloadAll();
    } catch (err: any) {
      setItemError(err.message || "No se pudo guardar el artículo");
    }
  }

  // ---- Compras ----
  function openPurchase(it: any) {
    setPurchaseItem(it);
    setPurchaseForm({
      quantity: "1",
      unitCost: it.unitValue ? String(it.unitValue) : "",
      notes: "",
      updateUnitValue: true,
    });
    setPurchaseError(null);
  }

  async function handlePurchase(e: React.FormEvent) {
    e.preventDefault();
    setPurchaseError(null);
    try {
      await api.createInventoryPurchase(purchaseItem.id, {
        quantity: Number(purchaseForm.quantity),
        unitCost: Number(purchaseForm.unitCost),
        notes: purchaseForm.notes || null,
        updateUnitValue: purchaseForm.updateUnitValue,
      });
      setPurchaseItem(null);
      reloadAll();
    } catch (err: any) {
      setPurchaseError(err.message || "No se pudo registrar la compra");
    }
  }

  // ---- Préstamos ----
  function openLoanForm(itemId?: number) {
    setLoanForm({
      itemId: itemId ? String(itemId) : "",
      quantity: "1",
      kmOut: "",
      borrowerType: "asociado",
      affiliateId: "",
      affiliateQuery: "",
      borrowerName: "",
      notes: "",
    });
    setLoanError(null);
    setShowLoanForm(true);
  }

  async function handleCreateLoan(e: React.FormEvent) {
    e.preventDefault();
    setLoanError(null);
    try {
      await api.createInventoryLoan({
        itemId: Number(loanForm.itemId),
        quantity: loanItem?.trackKm ? 1 : Number(loanForm.quantity),
        kmOut: loanItem?.trackKm ? Number(loanForm.kmOut) : null,
        affiliateId: loanForm.borrowerType === "asociado" ? Number(loanForm.affiliateId) : null,
        borrowerName: loanForm.borrowerType === "otro" ? loanForm.borrowerName : null,
        notes: loanForm.notes || null,
      });
      setShowLoanForm(false);
      reloadAll();
    } catch (err: any) {
      setLoanError(err.message || "No se pudo registrar el préstamo");
    }
  }

  async function handleReturn(loan: any) {
    let kmIn: number | undefined;
    if (loan.item?.trackKm) {
      const input = window.prompt(
        `Kilometraje con el que se devuelve "${loan.item.name}" (salió con ${loan.kmOut ?? "?"} km)`
      );
      if (input === null) return;
      kmIn = Number(input);
      if (!input.trim() || !Number.isFinite(kmIn)) {
        alert("Hay que escribir el kilometraje.");
        return;
      }
    } else if (!window.confirm("¿Marcar este préstamo como devuelto?")) {
      return;
    }
    try {
      await api.returnInventoryLoan(loan.id, kmIn !== undefined ? { kmIn } : undefined);
      reloadAll();
    } catch (err: any) {
      alert(err.message || "No se pudo registrar la devolución");
    }
  }

  const totalStockValue = summary?.inventoryValue ?? items.filter((i) => i.active).reduce((s, i) => s + i.totalValue, 0);

  return (
    <div>
      <div className="page-header">
        <h1>Inventario</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="small-button" onClick={() => openLoanForm()}>Registrar préstamo</button>
          <button onClick={() => (showItemForm ? setShowItemForm(false) : startCreateItem())}>
            {showItemForm ? "Cancelar" : "Nuevo artículo"}
          </button>
        </div>
      </div>

      {/* ---- Resumen económico ---- */}
      <div className="inline-form" style={{ marginBottom: 12 }}>
        <strong>Resumen del mes</strong>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div className="stat-card" style={{ flex: "1 1 200px" }}>
          <div className="note" style={{ margin: 0 }}>Valor del inventario</div>
          <strong style={{ fontSize: 22 }}>{money(totalStockValue)}</strong>
          <div className="note" style={{ margin: 0 }}>{summary?.itemsCount ?? 0} artículos activos</div>
        </div>
        <div className="stat-card" style={{ flex: "1 1 200px" }}>
          <div className="note" style={{ margin: 0 }}>Entregado en el mes</div>
          <strong style={{ fontSize: 22 }}>{money(summary?.delivered.value ?? 0)}</strong>
          <div className="note" style={{ margin: 0 }}>
            {summary?.delivered.loans ?? 0} préstamo(s) · {summary?.delivered.units ?? 0} unidad(es)
          </div>
        </div>
        <div className="stat-card" style={{ flex: "1 1 200px" }}>
          <div className="note" style={{ margin: 0 }}>Gastado en compras del mes</div>
          <strong style={{ fontSize: 22 }}>{money(summary?.purchased.value ?? 0)}</strong>
          <div className="note" style={{ margin: 0 }}>{summary?.purchased.units ?? 0} unidad(es) compradas</div>
        </div>
      </div>

      {summary && (summary.delivered.byItem.length > 0 || summary.kmByVehicle.length > 0) && (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
          {summary.delivered.byItem.length > 0 && (
            <table className="data-table" style={{ flex: "1 1 320px" }}>
              <thead><tr><th>Entregado en el mes</th><th>Unidades</th><th>Valor</th></tr></thead>
              <tbody>
                {summary.delivered.byItem.map((e: any) => (
                  <tr key={e.name}><td>{e.name}</td><td>{e.units}</td><td>{money(e.value)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {summary.kmByVehicle.length > 0 && (
            <table className="data-table" style={{ flex: "1 1 280px" }}>
              <thead><tr><th>Vehículo</th><th>Km recorridos en el mes</th></tr></thead>
              <tbody>
                {summary.kmByVehicle.map((v: any) => (
                  <tr key={v.name}><td>{v.name}</td><td>{v.km.toLocaleString("es-AR")} km</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ---- Alta / edición de artículo ---- */}
      {showItemForm && (
        <form
          className="inline-form"
          onSubmit={handleSaveItem}
          style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 480, marginBottom: 24 }}
        >
          <h3 style={{ marginTop: 0 }}>{editingItemId ? "Editar artículo" : "Nuevo artículo"}</h3>
          <label>Nombre</label>
          <input
            placeholder="Ej: Hilux AB123CD, Taladro, Carpa 4x4"
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            required
          />
          <label>Cantidad total</label>
          <input
            type="number"
            min="0"
            value={itemForm.quantity}
            onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
            required
          />
          <label>Valor de cada unidad ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Para calcular el valor del inventario"
            value={itemForm.unitValue}
            onChange={(e) => setItemForm({ ...itemForm, unitValue: e.target.value })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={itemForm.trackKm}
              onChange={(e) => setItemForm({ ...itemForm, trackKm: e.target.checked })}
            />
            Es un vehículo (pide el kilometraje al prestar y al devolver)
          </label>
          {itemError && <div className="error-box">{itemError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit">Guardar</button>
            <button type="button" className="small-button" onClick={() => setShowItemForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {/* ---- Compra ---- */}
      {purchaseItem && (
        <form
          className="inline-form"
          onSubmit={handlePurchase}
          style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 480, marginBottom: 24 }}
        >
          <h3 style={{ marginTop: 0 }}>Registrar compra: {purchaseItem.name}</h3>
          <label>Cantidad comprada</label>
          <input
            type="number"
            min="1"
            value={purchaseForm.quantity}
            onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
            required
          />
          <label>Costo de cada unidad ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={purchaseForm.unitCost}
            onChange={(e) => setPurchaseForm({ ...purchaseForm, unitCost: e.target.value })}
            required
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={purchaseForm.updateUnitValue}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, updateUnitValue: e.target.checked })}
            />
            Usar este costo como nuevo valor del artículo
          </label>
          <label>Observaciones</label>
          <input
            placeholder="Opcional (proveedor, factura...)"
            value={purchaseForm.notes}
            onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
          />
          <p className="note" style={{ margin: 0 }}>
            Se suma al stock y queda anotado como gasto del mes:{" "}
            {money((Number(purchaseForm.quantity) || 0) * (Number(purchaseForm.unitCost) || 0))}
          </p>
          {purchaseError && <div className="error-box">{purchaseError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit">Registrar compra</button>
            <button type="button" className="small-button" onClick={() => setPurchaseItem(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {/* ---- Listado de artículos ---- */}
      <table className="data-table" style={{ marginBottom: 32 }}>
        <thead>
          <tr>
            <th>Artículo</th><th>Total</th><th>Prestados</th><th>Disponibles</th>
            <th>Valor unitario</th><th>Valor total</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={it.active ? undefined : { opacity: 0.5 }}>
              <td>
                {it.name} {it.trackKm && <span className="badge badge-active">vehículo</span>}
              </td>
              <td>{it.quantity}</td>
              <td>{it.lent}</td>
              <td>{it.available}</td>
              <td>{it.unitValue ? money(it.unitValue) : "—"}</td>
              <td>{it.unitValue ? money(it.totalValue) : "—"}</td>
              <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="small-button" onClick={() => openLoanForm(it.id)} disabled={it.available <= 0}>
                  Prestar
                </button>
                <button className="small-button" onClick={() => openPurchase(it)}>Comprar</button>
                <button className="small-button" onClick={() => startEditItem(it)}>Editar</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={7}>Todavía no hay artículos cargados.</td></tr>}
        </tbody>
      </table>

      {/* ---- Préstamo ---- */}
      {showLoanForm && (
        <form
          className="inline-form"
          onSubmit={handleCreateLoan}
          style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 480, marginBottom: 24 }}
        >
          <h3 style={{ marginTop: 0 }}>Registrar préstamo</h3>

          <label>Artículo</label>
          <select value={loanForm.itemId} onChange={(e) => setLoanForm({ ...loanForm, itemId: e.target.value })} required>
            <option value="">Elegir artículo...</option>
            {items.filter((it) => it.active).map((it) => (
              <option key={it.id} value={it.id} disabled={it.available <= 0}>
                {it.name} (disponibles: {it.available})
              </option>
            ))}
          </select>

          {loanItem?.trackKm ? (
            <>
              <label>Kilometraje actual del vehículo</label>
              <input
                type="number"
                min="0"
                placeholder="Km que marca el tablero al salir"
                value={loanForm.kmOut}
                onChange={(e) => setLoanForm({ ...loanForm, kmOut: e.target.value })}
                required
              />
            </>
          ) : (
            <>
              <label>Cantidad</label>
              <input
                type="number"
                min="1"
                value={loanForm.quantity}
                onChange={(e) => setLoanForm({ ...loanForm, quantity: e.target.value })}
                required
              />
            </>
          )}

          <label>Se le presta a</label>
          <div className="tabs" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className={loanForm.borrowerType === "asociado" ? "active" : ""}
              onClick={() => setLoanForm({ ...loanForm, borrowerType: "asociado" })}
            >
              Un asociado
            </button>
            <button
              type="button"
              className={loanForm.borrowerType === "otro" ? "active" : ""}
              onClick={() => setLoanForm({ ...loanForm, borrowerType: "otro" })}
            >
              Otra persona
            </button>
          </div>

          {loanForm.borrowerType === "asociado" ? (
            <>
              {selectedAffiliate ? (
                <div className="note" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{selectedAffiliate.lastName}, {selectedAffiliate.firstName} (N° {selectedAffiliate.affiliateNumber})</span>
                  <button type="button" className="small-button" onClick={() => setLoanForm({ ...loanForm, affiliateId: "", affiliateQuery: "" })}>
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <input
                    placeholder="Buscar por nombre, DNI o N° de asociado..."
                    value={loanForm.affiliateQuery}
                    onChange={(e) => setLoanForm({ ...loanForm, affiliateQuery: e.target.value })}
                  />
                  {filteredAffiliates.length > 0 && (
                    <ul className="timeline" style={{ maxHeight: 160, overflowY: "auto" }}>
                      {filteredAffiliates.map((a) => (
                        <li
                          key={a.id}
                          className="clickable-row"
                          onClick={() => setLoanForm({ ...loanForm, affiliateId: String(a.id), affiliateQuery: "" })}
                        >
                          <span>{a.lastName}, {a.firstName}</span>
                          <span className="timeline-date">DNI {a.dni} — N° {a.affiliateNumber}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          ) : (
            <input
              placeholder="Nombre de la persona"
              value={loanForm.borrowerName}
              onChange={(e) => setLoanForm({ ...loanForm, borrowerName: e.target.value })}
              required
            />
          )}

          <label>Observaciones</label>
          <input
            placeholder="Opcional"
            value={loanForm.notes}
            onChange={(e) => setLoanForm({ ...loanForm, notes: e.target.value })}
          />

          {loanError && <div className="error-box">{loanError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit">Registrar préstamo</button>
            <button type="button" className="small-button" onClick={() => setShowLoanForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="page-header">
        <h2 style={{ margin: 0 }}>Préstamos</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)} />
          Solo sin devolver
        </label>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Artículo</th><th>Cant.</th><th>Prestado a</th><th>Entregado</th><th>Devuelto</th>
            <th>Km salida</th><th>Km regreso</th><th>Recorridos</th><th>Valor</th><th>Observaciones</th><th></th>
          </tr>
        </thead>
        <tbody>
          {loans.map((l) => (
            <tr key={l.id}>
              <td>{l.item?.name}</td>
              <td>{l.quantity}</td>
              <td>{l.affiliate ? `${l.affiliate.lastName}, ${l.affiliate.firstName}` : l.borrowerName}</td>
              <td>{new Date(l.deliveredAt).toLocaleDateString("es-AR")}</td>
              <td>{l.returnedAt ? new Date(l.returnedAt).toLocaleDateString("es-AR") : "—"}</td>
              <td>{l.kmOut !== null && l.kmOut !== undefined ? l.kmOut.toLocaleString("es-AR") : "—"}</td>
              <td>{l.kmIn !== null && l.kmIn !== undefined ? l.kmIn.toLocaleString("es-AR") : "—"}</td>
              <td>
                {l.kmOut !== null && l.kmOut !== undefined && l.kmIn !== null && l.kmIn !== undefined
                  ? `${(l.kmIn - l.kmOut).toLocaleString("es-AR")} km`
                  : "—"}
              </td>
              <td>{l.unitValueAtLoan ? money(l.quantity * l.unitValueAtLoan) : "—"}</td>
              <td>{l.notes || "—"}</td>
              <td>
                {!l.returnedAt && (
                  <button className="small-button" onClick={() => handleReturn(l)}>Marcar devuelto</button>
                )}
              </td>
            </tr>
          ))}
          {loans.length === 0 && <tr><td colSpan={11}>No hay préstamos{showActiveOnly ? " sin devolver" : ""} para mostrar.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
