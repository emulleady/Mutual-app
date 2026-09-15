import { useEffect, useState } from "react";
import { api } from "../api/client";
import { installmentStatusLabels, loanStatusLabels, translate } from "../utils/labels";

export default function LoanPanel({ affiliateId }: { affiliateId: number }) {
  const [loans, setLoans] = useState<any[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ loanType: "", amount: "", installmentsCount: "" });
  const [error, setError] = useState<string | null>(null);

  function loadLoans() {
    api.loansByAffiliate(affiliateId).then(setLoans).catch(() => {});
  }

  useEffect(loadLoans, [affiliateId]);

  async function openLoan(id: number) {
    const detail = await api.getLoan(id);
    setSelectedLoan(detail);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createLoan({
        affiliateId,
        loanType: form.loanType,
        amount: Number(form.amount),
        installmentsCount: Number(form.installmentsCount),
      });
      setShowForm(false);
      setForm({ loanType: "", amount: "", installmentsCount: "" });
      loadLoans();
    } catch (err: any) {
      setError(err.message || "No se pudo crear el préstamo");
    }
  }

  async function handlePay(installmentId: number, suggested: number) {
    const input = window.prompt("Monto a pagar", suggested.toString());
    if (!input) return;
    await api.registerPayment({ loanInstallmentId: installmentId, amount: Number(input) });
    const refreshed = await api.getLoan(selectedLoan.id);
    setSelectedLoan(refreshed);
    loadLoans();
  }

  const activeLoans = loans.filter((l) => l.status === "active" || l.status === "overdue");
  const historicalLoans = loans.filter((l) => l.status !== "active" && l.status !== "overdue");

  if (selectedLoan) {
    return (
      <div>
        <button className="link-button-dark" onClick={() => setSelectedLoan(null)}>← Volver a préstamos</button>
        <h3>{selectedLoan.loanType} — ${selectedLoan.amount}</h3>
        <p>Estado: <span className={`badge badge-loan-${selectedLoan.status}`}>{translate(loanStatusLabels, selectedLoan.status)}</span></p>
        <table className="data-table">
          <thead>
            <tr><th>Cuota</th><th>Vencimiento</th><th>Monto</th><th>Pagado</th><th>Mora</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {selectedLoan.installments.map((i: any) => (
              <tr key={i.id}>
                <td>{i.number}</td>
                <td>{new Date(i.dueDate).toLocaleDateString("es-AR")}</td>
                <td>${i.amount}</td>
                <td>${i.paidAmount}</td>
                <td>{i.penalties?.[0] ? `$${i.penalties[0].penaltyAmount} (${i.penalties[0].daysOverdue} días)` : "—"}</td>
                <td><span className={`badge badge-loan-${i.status}`}>{translate(installmentStatusLabels, i.status)}</span></td>
                <td>
                  {i.status !== "paid" && (
                    <button className="small-button" onClick={() => handlePay(i.id, i.amount - i.paidAmount)}>
                      Registrar pago
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h3>Préstamos activos</h3>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancelar" : "Nuevo préstamo"}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={handleCreate}>
          <input placeholder="Tipo (ej. Personal)" value={form.loanType}
            onChange={(e) => setForm({ ...form, loanType: e.target.value })} required />
          <input placeholder="Monto" type="number" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <input placeholder="Cantidad de cuotas" type="number" value={form.installmentsCount}
            onChange={(e) => setForm({ ...form, installmentsCount: e.target.value })} required />
          {error && <div className="error-box">{error}</div>}
          <button type="submit">Otorgar préstamo</button>
        </form>
      )}

      <table className="data-table">
        <thead><tr><th>Tipo</th><th>Monto</th><th>Cuotas</th><th>Saldo</th><th>Próximo vto.</th><th>Mora</th><th>Estado</th></tr></thead>
        <tbody>
          {activeLoans.map((l) => (
            <tr key={l.id} className="clickable-row" onClick={() => openLoan(l.id)}>
              <td>{l.loanType}</td>
              <td>${l.amount}</td>
              <td>{l.paidInstallments}/{l.totalInstallments}</td>
              <td>${l.outstandingBalance}</td>
              <td>{l.nextDueDate ? new Date(l.nextDueDate).toLocaleDateString("es-AR") : "—"}</td>
              <td>{l.totalPenalty > 0 ? `$${l.totalPenalty}` : "—"}</td>
              <td><span className={`badge badge-loan-${l.status}`}>{translate(loanStatusLabels, l.status)}</span></td>
            </tr>
          ))}
          {activeLoans.length === 0 && <tr><td colSpan={7}>Sin préstamos activos.</td></tr>}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Historial de préstamos</h3>
      <table className="data-table">
        <thead><tr><th>Tipo</th><th>Monto</th><th>Cuotas</th><th>Saldo</th><th>Estado</th></tr></thead>
        <tbody>
          {historicalLoans.map((l) => (
            <tr key={l.id} className="clickable-row" onClick={() => openLoan(l.id)}>
              <td>{l.loanType}</td>
              <td>${l.amount}</td>
              <td>{l.paidInstallments}/{l.totalInstallments}</td>
              <td>${l.outstandingBalance}</td>
              <td><span className={`badge badge-loan-${l.status}`}>{translate(loanStatusLabels, l.status)}</span></td>
            </tr>
          ))}
          {historicalLoans.length === 0 && <tr><td colSpan={5}>Sin préstamos históricos.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
