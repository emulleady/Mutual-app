import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

export default function Inventory() {
  const [items, setItems] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", quantity: "" });
  const [itemError, setItemError] = useState<string | null>(null);

  const [showLoanForm, setShowLoanForm] = useState(false);
  const [loanForm, setLoanForm] = useState({
    itemId: "",
    quantity: "1",
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

  useEffect(loadItems, []);
  useEffect(loadLoans, [showActiveOnly]);
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

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setItemError(null);
    try {
      await api.createInventoryItem({ name: itemForm.name, quantity: Number(itemForm.quantity) });
      setItemForm({ name: "", quantity: "" });
      setShowItemForm(false);
      loadItems();
    } catch (err: any) {
      setItemError(err.message || "No se pudo guardar el artículo");
    }
  }

  function openLoanForm(itemId?: number) {
    setLoanForm({
      itemId: itemId ? String(itemId) : "",
      quantity: "1",
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
        quantity: Number(loanForm.quantity),
        affiliateId: loanForm.borrowerType === "asociado" ? Number(loanForm.affiliateId) : null,
        borrowerName: loanForm.borrowerType === "otro" ? loanForm.borrowerName : null,
        notes: loanForm.notes || null,
      });
      setShowLoanForm(false);
      loadItems();
      loadLoans();
    } catch (err: any) {
      setLoanError(err.message || "No se pudo registrar el préstamo");
    }
  }

  async function handleReturn(loanId: number) {
    if (!window.confirm("¿Marcar este préstamo como devuelto?")) return;
    await api.returnInventoryLoan(loanId);
    loadItems();
    loadLoans();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Inventario</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="small-button" onClick={() => openLoanForm()}>Registrar préstamo</button>
          <button onClick={() => setShowItemForm((v) => !v)}>{showItemForm ? "Cancelar" : "Nuevo artículo"}</button>
        </div>
      </div>

      {showItemForm && (
        <form className="inline-form" onSubmit={handleCreateItem}>
          <input
            placeholder="Nombre del artículo"
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            required
          />
          <input
            placeholder="Cantidad total"
            type="number"
            min="0"
            value={itemForm.quantity}
            onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })}
            required
          />
          {itemError && <div className="error-box">{itemError}</div>}
          <button type="submit">Guardar</button>
        </form>
      )}

      <table className="data-table" style={{ marginBottom: 32 }}>
        <thead><tr><th>Artículo</th><th>Total</th><th>Prestados</th><th>Disponibles</th><th></th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.name}</td>
              <td>{it.quantity}</td>
              <td>{it.lent}</td>
              <td>{it.available}</td>
              <td>
                <button className="small-button" onClick={() => openLoanForm(it.id)} disabled={it.available <= 0}>
                  Prestar
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5}>Todavía no hay artículos cargados.</td></tr>}
        </tbody>
      </table>

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
            {items.map((it) => (
              <option key={it.id} value={it.id} disabled={it.available <= 0}>
                {it.name} (disponibles: {it.available})
              </option>
            ))}
          </select>

          <label>Cantidad</label>
          <input
            type="number"
            min="1"
            value={loanForm.quantity}
            onChange={(e) => setLoanForm({ ...loanForm, quantity: e.target.value })}
            required
          />

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
        <thead><tr><th>Artículo</th><th>Cant.</th><th>Prestado a</th><th>Entregado</th><th>Devuelto</th><th>Observaciones</th><th></th></tr></thead>
        <tbody>
          {loans.map((l) => (
            <tr key={l.id}>
              <td>{l.item?.name}</td>
              <td>{l.quantity}</td>
              <td>{l.affiliate ? `${l.affiliate.lastName}, ${l.affiliate.firstName}` : l.borrowerName}</td>
              <td>{new Date(l.deliveredAt).toLocaleDateString("es-AR")}</td>
              <td>{l.returnedAt ? new Date(l.returnedAt).toLocaleDateString("es-AR") : "—"}</td>
              <td>{l.notes || "—"}</td>
              <td>
                {!l.returnedAt && (
                  <button className="small-button" onClick={() => handleReturn(l.id)}>Marcar devuelto</button>
                )}
              </td>
            </tr>
          ))}
          {loans.length === 0 && <tr><td colSpan={7}>No hay préstamos{showActiveOnly ? " sin devolver" : ""} para mostrar.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
