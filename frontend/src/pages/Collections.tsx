import { useEffect, useState } from "react";
import { api } from "../api/client";

const money = (n: number) =>
  (n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

// Cobranzas: lo que paga cada empresa por mes (monto total). El sistema lo
// compara con lo que se le liquido y, si cubre todo, marca las cuotas de
// ordenes de compra como pagas y registra el ingreso en la caja.
export default function Collections() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<any | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ companyId: "", receivedAt: today(), amount: "", accountId: "", notes: "", forceMarkPaid: false });
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);

  function load() {
    api.collectionsSummary(month).then(setSummary).catch(() => setSummary(null));
    api.listCollections(month).then(setList).catch(() => setList([]));
  }
  useEffect(load, [month]);
  useEffect(() => {
    api.listCompanies()
      .then((c: any) => {
        if (!Array.isArray(c)) throw new Error("Respuesta inesperada del servidor");
        setCompanies(c);
        setCompaniesError(null);
      })
      .catch((err: any) => setCompaniesError(err?.message || "No se pudo cargar la lista de empresas"));
    api.financeAccounts().then((a: any[]) => {
      const act = a.filter((x) => x.active);
      setAccounts(act);
      setForm((f) => (f.accountId || act.length === 0 ? f : { ...f, accountId: String(act[0].id) }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setPreview(null);
    if (showForm && form.companyId) {
      api.collectionPreview(Number(form.companyId), month).then(setPreview).catch(() => setPreview(null));
    }
  }, [form.companyId, month, showForm]);

  function openFor(companyId?: number, suggested?: number) {
    setError(null);
    setOkMsg(null);
    setForm((f) => ({
      ...f,
      companyId: companyId ? String(companyId) : f.companyId,
      amount: suggested && suggested > 0 ? String(suggested) : "",
      forceMarkPaid: false,
      notes: "",
    }));
    setShowForm(true);
  }

  const amountNum = Number(form.amount || 0);
  const missing = preview ? Math.round((preview.remaining - amountNum) * 100) / 100 : 0;
  const coversAll = preview ? amountNum > 0 && amountNum >= preview.remaining : false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    setSaving(true);
    try {
      const r = await api.createCollection({
        companyId: Number(form.companyId),
        month,
        receivedAt: form.receivedAt,
        amount: amountNum,
        accountId: Number(form.accountId),
        notes: form.notes || null,
        forceMarkPaid: form.forceMarkPaid,
      });
      setOkMsg(
        `Cobranza registrada. ${r.installmentsMarked > 0 ? `${r.installmentsMarked} cuota(s) de órdenes marcadas como pagas.` : "No se marcaron cuotas como pagas."}`
      );
      setShowForm(false);
      setForm((f) => ({ ...f, amount: "", notes: "", forceMarkPaid: false }));
      load();
    } catch (err: any) {
      setError(err.message || "No se pudo registrar la cobranza");
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid(p: any) {
    const reason = window.prompt(`Motivo para anular la cobranza de ${p.company.name} (${money(p.amount)}):`);
    if (!reason || !reason.trim()) return;
    try {
      await api.voidCollection(p.id, reason.trim());
      load();
    } catch (err: any) {
      setError(err.message || "No se pudo anular la cobranza");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Cobranzas de empresas</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes" />
          <button onClick={() => (showForm ? setShowForm(false) : openFor())}>{showForm ? "Cancelar" : "Registrar cobranza"}</button>
        </div>
      </div>
      <p className="note">
        Cargá lo que te pagó cada empresa por el mes elegido. Si el monto cubre lo liquidado, las cuotas de órdenes de compra de ese mes
        se marcan como pagas y el ingreso entra solo a la Caja.
      </p>

      {okMsg && <div className="tab-panel" style={{ marginBottom: 12 }}><p>{okMsg}</p></div>}

      {showForm && (
        <form className="inline-form" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
          <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required>
            <option value="">{companies.length === 0 ? "No hay empresas cargadas" : "Empresa…"}</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active === false ? " (inactiva)" : ""}</option>)}
          </select>
          {companiesError && <div className="error-box" style={{ flexBasis: "100%" }}>No se pudo cargar la lista de empresas: {companiesError}</div>}
          {!companiesError && companies.length === 0 && (
            <div className="error-box" style={{ flexBasis: "100%" }}>
              Todavía no hay empresas cargadas. Cargalas o importalas desde la pantalla Empresas.
            </div>
          )}
          <input type="date" max={today()} value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} required />
          <input type="number" step="0.01" min="0.01" placeholder="Monto recibido" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} required>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input placeholder="Nota (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          {preview && (
            <div style={{ flexBasis: "100%" }}>
              <p className="note" style={{ margin: 0 }}>
                Liquidado a la empresa en {month}: <strong>{money(preview.expected)}</strong>
                {preview.alreadyPaid > 0 && <> · ya cobrado: <strong>{money(preview.alreadyPaid)}</strong></>}
                {" "}· falta cobrar: <strong>{money(preview.remaining)}</strong>
                {preview.payments === 0 && <> ({preview.installmentsCount} cuota(s) de órdenes + cuota social {money(preview.feeTotal)})</>}
              </p>
              {amountNum > 0 && coversAll && (
                <p className="note" style={{ margin: 0 }}>
                  El monto cubre lo liquidado: las cuotas de órdenes se marcarán como pagas.
                  {missing < 0 && <> Sobran {money(-missing)}.</>}
                </p>
              )}
              {amountNum > 0 && !coversAll && (
                <>
                  <p className="error-box" style={{ margin: "6px 0" }}>
                    Faltan {money(missing)} para cubrir lo liquidado. Por defecto NO se marcan las cuotas como pagas.
                  </p>
                  <label>
                    <input type="checkbox" checked={form.forceMarkPaid}
                      onChange={(e) => setForm({ ...form, forceMarkPaid: e.target.checked })} />{" "}
                    Marcar igual todas las cuotas del mes como pagas
                  </label>
                </>
              )}
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
          <button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar cobranza"}</button>
        </form>
      )}
      {!showForm && error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      <h3>Estado del mes</h3>
      <table className="data-table" style={{ marginBottom: 24 }}>
        <thead>
          <tr><th>Empresa</th><th>Liquidado</th><th>Cobrado</th><th>Falta cobrar</th><th></th></tr>
        </thead>
        <tbody>
          {(summary?.rows || []).map((r: any) => (
            <tr key={r.companyId}>
              <td>{r.companyName}</td>
              <td>{money(r.expected)}</td>
              <td>{money(r.alreadyPaid)}</td>
              <td style={{ fontWeight: 600, color: r.remaining > 0.009 ? "#b45309" : r.remaining < -0.009 ? "#1d4ed8" : "#15803d" }}>
                {r.remaining > 0.009 ? money(r.remaining) : r.remaining < -0.009 ? `${money(-r.remaining)} de más` : "Cobrado"}
              </td>
              <td>
                {r.remaining > 0.009 && (
                  <button className="small-button" onClick={() => openFor(r.companyId, r.remaining)}>Registrar cobranza</button>
                )}
              </td>
            </tr>
          ))}
          {summary && summary.rows.length === 0 && (
            <tr><td colSpan={5}>Ninguna empresa tiene cuotas para descontar en {month}.</td></tr>
          )}
          {summary && summary.rows.length > 0 && (
            <tr style={{ fontWeight: 700 }}>
              <td>Total</td>
              <td>{money(summary.total.expected)}</td>
              <td>{money(summary.total.paid)}</td>
              <td>{money(summary.total.remaining)}</td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Cobranzas registradas</h3>
      <table className="data-table">
        <thead>
          <tr><th>Fecha</th><th>Empresa</th><th>Monto</th><th>Cuenta</th><th>Cuotas marcadas</th><th>Nota</th><th></th></tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id} style={p.voided ? { opacity: 0.5, textDecoration: "line-through" } : undefined}>
              <td>{new Date(p.receivedAt).toLocaleDateString("es-AR")}</td>
              <td>{p.company.name}</td>
              <td>{money(p.amount)}</td>
              <td>{p.account.name}</td>
              <td>{p._count.installments}</td>
              <td>{p.voided ? `ANULADA: ${p.voidedReason || ""}` : p.notes || ""}</td>
              <td>{!p.voided && <button className="small-button" onClick={() => handleVoid(p)}>Anular</button>}</td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={7}>No hay cobranzas registradas en {month}.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
