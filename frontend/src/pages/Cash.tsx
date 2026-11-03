import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

const money = (n: number) =>
  (n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

// Caja: todo el dinero que entra y sale (incluso la compra de una lapicera),
// con cuenta, categoria y comprobante. Los ingresos por cobranza de empresas
// entran solos desde la pantalla Cobranzas.
export default function Cash() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [typeFilter, setTypeFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [text, setText] = useState("");

  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [showVoided, setShowVoided] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "expense", date: today(), amount: "", concept: "", accountId: "", categoryId: "", notes: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showSetup, setShowSetup] = useState(false);
  const [accForm, setAccForm] = useState({ name: "", openingBalance: "" });
  const [catForm, setCatForm] = useState({ name: "", kind: "expense" });
  const [setupError, setSetupError] = useState<string | null>(null);

  function loadBase() {
    api.financeAccounts().then((a: any[]) => {
      setAccounts(a);
      setForm((f) => {
        if (f.accountId) return f;
        const first = a.find((x) => x.active);
        return first ? { ...f, accountId: String(first.id) } : f;
      });
    }).catch(() => {});
    api.financeCategories().then(setCategories).catch(() => {});
  }
  useEffect(loadBase, []);

  function load() {
    api
      .listMovements({
        from, to, type: typeFilter, accountId: accountFilter, categoryId: categoryFilter, q: text,
        includeVoided: showVoided ? "true" : "",
      })
      .then(setMovements)
      .catch(() => setMovements([]));
    api.financeSummary(from, to).then(setSummary).catch(() => setSummary(null));
  }
  useEffect(load, [from, to, typeFilter, accountFilter, categoryFilter, text, showVoided]);

  const formCategories = useMemo(
    () => categories.filter((c) => c.active && c.kind === form.type),
    [categories, form.type]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const created = await api.createMovement({
        type: form.type,
        date: form.date,
        amount: Number(form.amount),
        concept: form.concept,
        accountId: Number(form.accountId),
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        notes: form.notes || null,
      });
      const failed: string[] = [];
      for (const f of files) {
        try {
          await api.uploadMovementAttachment(created.id, f);
        } catch (err: any) {
          failed.push(`${f.name}: ${err.message}`);
        }
      }
      if (failed.length > 0) {
        setError(`El movimiento se guardó, pero no se pudieron subir: ${failed.join("; ")}`);
      } else {
        setShowForm(false);
      }
      setForm((f) => ({ ...f, amount: "", concept: "", notes: "", categoryId: "" }));
      setFiles([]);
      load();
    } catch (err: any) {
      setError(err.message || "No se pudo guardar el movimiento");
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid(m: any) {
    const reason = window.prompt(`Motivo para anular "${m.concept}" (${money(m.amount)}):`);
    if (!reason || !reason.trim()) return;
    try {
      await api.voidMovement(m.id, reason.trim());
      load();
    } catch (err: any) {
      window.alert(err.message || "No se pudo anular el movimiento");
    }
  }

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setSetupError(null);
    try {
      await api.createFinanceAccount({ name: accForm.name, openingBalance: accForm.openingBalance ? Number(accForm.openingBalance) : 0 });
      setAccForm({ name: "", openingBalance: "" });
      loadBase();
      load();
    } catch (err: any) {
      setSetupError(err.message || "No se pudo crear la cuenta");
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    setSetupError(null);
    try {
      await api.createFinanceCategory(catForm);
      setCatForm({ name: "", kind: catForm.kind });
      loadBase();
    } catch (err: any) {
      setSetupError(err.message || "No se pudo crear la categoría");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Caja</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="small-button" onClick={() => api.downloadFinanceExport(from, to)}>Descargar Excel</button>
          <button className="small-button" onClick={() => setShowSetup((v) => !v)}>Cuentas y categorías</button>
          <button onClick={() => { setShowForm((v) => !v); setError(null); }}>{showForm ? "Cancelar" : "Nuevo movimiento"}</button>
        </div>
      </div>

      <div className="inline-form" style={{ marginBottom: 12 }}>
        <label>Desde <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Hasta <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Ingresos y egresos</option>
          <option value="income">Solo ingresos</option>
          <option value="expense">Solo egresos</option>
        </select>
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind === "income" ? "ingreso" : "egreso"})</option>)}
        </select>
        <input placeholder="Buscar por concepto…" value={text} onChange={(e) => setText(e.target.value)} />
        <label><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> Ver anulados</label>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div className="stat-card" style={{ flex: "1 1 180px" }}>
          <div className="note" style={{ margin: 0 }}>Ingresos del período</div>
          <strong style={{ fontSize: 22, color: "#15803d" }}>{money(summary?.income ?? 0)}</strong>
        </div>
        <div className="stat-card" style={{ flex: "1 1 180px" }}>
          <div className="note" style={{ margin: 0 }}>Egresos del período</div>
          <strong style={{ fontSize: 22, color: "#b91c1c" }}>{money(summary?.expense ?? 0)}</strong>
        </div>
        <div className="stat-card" style={{ flex: "1 1 180px" }}>
          <div className="note" style={{ margin: 0 }}>Resultado</div>
          <strong style={{ fontSize: 22 }}>{money(summary?.net ?? 0)}</strong>
        </div>
        <div className="stat-card" style={{ flex: "1 1 180px" }}>
          <div className="note" style={{ margin: 0 }}>Saldo total al {to.split("-").reverse().join("/")}</div>
          <strong style={{ fontSize: 22 }}>{money(summary?.totalBalance ?? 0)}</strong>
        </div>
      </div>

      {showSetup && (
        <div className="tab-panel" style={{ marginBottom: 16 }}>
          <h3>Cuentas</h3>
          <table className="data-table">
            <thead><tr><th>Cuenta</th><th>Saldo inicial</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{money(a.openingBalance)}</td>
                  <td>{a.active ? "Activa" : "Inactiva"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="small-button" onClick={async () => {
                      const v = window.prompt(`Saldo inicial de ${a.name} (lo que había antes de usar el sistema):`, String(a.openingBalance));
                      if (v === null) return;
                      const n = Number(v.replace(",", "."));
                      if (Number.isNaN(n)) return;
                      await api.updateFinanceAccount(a.id, { openingBalance: n }); loadBase(); load();
                    }}>Saldo inicial</button>{" "}
                    <button className="small-button" onClick={async () => { await api.updateFinanceAccount(a.id, { active: !a.active }); loadBase(); }}>
                      {a.active ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="inline-form" onSubmit={addAccount}>
            <input placeholder="Nueva cuenta (ej. Mercado Pago)" value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} required />
            <input type="number" step="0.01" placeholder="Saldo inicial" value={accForm.openingBalance} onChange={(e) => setAccForm({ ...accForm, openingBalance: e.target.value })} />
            <button type="submit" className="small-button">Agregar cuenta</button>
          </form>

          <h3 style={{ marginTop: 16 }}>Categorías</h3>
          <p className="note">{categories.filter((c) => c.active).map((c) => `${c.name} (${c.kind === "income" ? "ingreso" : "egreso"})`).join(" · ")}</p>
          <form className="inline-form" onSubmit={addCategory}>
            <input placeholder="Nueva categoría" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required />
            <select value={catForm.kind} onChange={(e) => setCatForm({ ...catForm, kind: e.target.value })}>
              <option value="expense">Egreso</option>
              <option value="income">Ingreso</option>
            </select>
            <button type="submit" className="small-button">Agregar categoría</button>
          </form>
          {setupError && <div className="error-box">{setupError}</div>}
        </div>
      )}

      {showForm && (
        <form className="inline-form" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, categoryId: "" })}>
            <option value="expense">Egreso (sale dinero)</option>
            <option value="income">Ingreso (entra dinero)</option>
          </select>
          <input type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <input type="number" step="0.01" min="0.01" placeholder="Monto" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <input placeholder="Concepto (ej. Lapicera)" value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} required style={{ minWidth: 220 }} />
          <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} required>
            {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Sin categoría</option>
            {formCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Nota (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <label>
            Comprobante (foto o PDF, hasta 5)
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))} />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar movimiento"}</button>
        </form>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <table className="data-table" style={{ flex: "1 1 320px" }}>
          <thead><tr><th>Cuenta</th><th>Ingresos</th><th>Egresos</th><th>Saldo</th></tr></thead>
          <tbody>
            {(summary?.byAccount || []).map((a: any) => (
              <tr key={a.id}><td>{a.name}</td><td>{money(a.income)}</td><td>{money(a.expense)}</td><td><strong>{money(a.balance)}</strong></td></tr>
            ))}
          </tbody>
        </table>
        <table className="data-table" style={{ flex: "1 1 320px" }}>
          <thead><tr><th>Categoría</th><th>Tipo</th><th>Total</th></tr></thead>
          <tbody>
            {(summary?.byCategory || []).map((c: any, i: number) => (
              <tr key={i}><td>{c.name}</td><td>{c.type === "income" ? "Ingreso" : "Egreso"}</td><td>{money(c.total)}</td></tr>
            ))}
            {summary && summary.byCategory.length === 0 && <tr><td colSpan={3}>Sin movimientos en el período.</td></tr>}
          </tbody>
        </table>
      </div>

      <table className="data-table">
        <thead>
          <tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Cuenta</th><th>Ingreso</th><th>Egreso</th><th>Comprobantes</th><th></th></tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} style={m.voided ? { opacity: 0.5, textDecoration: "line-through" } : undefined}>
              <td>{new Date(m.date).toLocaleDateString("es-AR")}</td>
              <td>
                {m.concept}
                {m.source === "company_payment" && <span className="badge badge-active" style={{ marginLeft: 6 }}>cobranza</span>}
                {m.voided && <div className="note" style={{ margin: 0 }}>Anulado: {m.voidedReason}</div>}
              </td>
              <td>{m.category?.name || "—"}</td>
              <td>{m.account.name}</td>
              <td style={{ color: "#15803d" }}>{m.type === "income" ? money(m.amount) : ""}</td>
              <td style={{ color: "#b91c1c" }}>{m.type === "expense" ? money(m.amount) : ""}</td>
              <td>
                {m.attachments.map((a: any) => (
                  <button key={a.id} className="link-button-dark" onClick={() => api.downloadMovementAttachment(m.id, a.id, a.fileName)}>
                    {a.fileName.length > 18 ? `${a.fileName.slice(0, 15)}…` : a.fileName}
                  </button>
                ))}
              </td>
              <td>
                {!m.voided && m.source === "manual" && <button className="small-button" onClick={() => handleVoid(m)}>Anular</button>}
              </td>
            </tr>
          ))}
          {movements.length === 0 && <tr><td colSpan={8}>No hay movimientos con estos filtros.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
