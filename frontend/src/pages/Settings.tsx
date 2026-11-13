import { can } from "../utils/permissions";
import { useEffect, useState } from "react";
import { api } from "../api/client";

const SOCIO_TYPES = ["Activo", "Adherente", "Participante Activo", "Participante Adherente", "Participante Socio Deportivo", "Adherente Socio Deportivo", "Socio Deportivo", "Honorario"];

export default function Settings() {
  const readOnly = !can("settings.manage");
  const [rates, setRates] = useState<any[]>([]);
  const [rateType, setRateType] = useState<"daily" | "monthly">("monthly");
  const [rateValue, setRateValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [orderCounter, setOrderCounter] = useState<any | null>(null);
  const [nextNumberInput, setNextNumberInput] = useState("");
  const [counterError, setCounterError] = useState<string | null>(null);
  const [closingDay, setClosingDay] = useState<number | null>(null);
  const [closingInput, setClosingInput] = useState("");
  const [closingMsg, setClosingMsg] = useState<string | null>(null);
  const [closingError, setClosingError] = useState<string | null>(null);
  const [fees, setFees] = useState<any[]>([]);
  const [feeInputs, setFeeInputs] = useState<Record<string, string>>({});
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeSavedType, setFeeSavedType] = useState<string | null>(null);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [svcInputs, setSvcInputs] = useState<Record<number, string>>({});
  const [newSvcName, setNewSvcName] = useState("");
  const [newSvcAmount, setNewSvcAmount] = useState("");
  const [svcError, setSvcError] = useState<string | null>(null);

  function loadServices() {
    api.getServiceTypes().then((list: any[]) => {
      setServiceTypes(list);
      const inputs: Record<number, string> = {};
      list.forEach((t) => { inputs[t.id] = String(t.defaultAmount); });
      setSvcInputs(inputs);
    }).catch(() => {});
  }
  useEffect(loadServices, []);

  async function svcAction(fn: () => Promise<any>) {
    setSvcError(null);
    try { await fn(); loadServices(); } catch (e: any) { setSvcError(e.message || "No se pudo guardar"); }
  }

  function loadFees() {
    api.getMembershipFees().then((list: any[]) => {
      setFees(list);
      const inputs: Record<string, string> = {};
      SOCIO_TYPES.forEach((t) => {
        const existing = list.find((f) => f.socioType === t);
        inputs[t] = existing ? String(existing.feeAmount) : "";
      });
      setFeeInputs(inputs);
    }).catch(() => {});
  }
  useEffect(loadFees, []);

  async function handleFeeSubmit(socioType: string, e: React.FormEvent) {
    e.preventDefault();
    setFeeError(null);
    setFeeSavedType(null);
    try {
      await api.setMembershipFee(socioType, Number(feeInputs[socioType] || 0));
      setFeeSavedType(socioType);
      loadFees();
    } catch (err: any) {
      setFeeError(err.message || "No se pudo guardar el valor de cuota");
    }
  }

  function loadClosing() {
    api.getClosingDay().then((r: any) => {
      setClosingDay(r.closingDay);
      setClosingInput(r.closingDay ? String(r.closingDay) : "");
    }).catch(() => {});
  }
  useEffect(loadClosing, []);

  async function handleClosingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setClosingError(null);
    setClosingMsg(null);
    try {
      const value = closingInput.trim() === "" ? null : Number(closingInput);
      await api.setClosingDay(value);
      setClosingMsg(value ? `Guardado: el resumen cierra el día ${value}.` : "Guardado: sin fecha de cierre.");
      loadClosing();
    } catch (err: any) {
      setClosingError(err.message || "No se pudo guardar el día de cierre");
    }
  }

  function loadCounter() {
    api.getOrderCounter().then(setOrderCounter).catch(() => {});
  }
  useEffect(loadCounter, []);

  async function handleCounterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCounterError(null);
    try {
      await api.setOrderCounter(Number(nextNumberInput));
      setNextNumberInput("");
      loadCounter();
    } catch (err: any) {
      setCounterError(err.message || "No se pudo guardar el número");
    }
  }

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
      {readOnly && <p className="note">Solo lectura: no tenés permiso para modificar la configuración.</p>}
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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

      <h1 style={{ marginTop: 40 }}>Numeración de Órdenes de Compra</h1>
      <p>
        {orderCounter
          ? `La próxima orden de compra que se genere va a llevar el número A-${String(orderCounter.nextNumber).padStart(9, "0")}.`
          : "Cargando..."}
      </p>
      <p className="note">
        Usá esto una sola vez para alinear el correlativo con el que ya se venía usando en papel
        (por ejemplo, si la última orden en papel fue la A-000001166, cargá 1167 acá para que la
        próxima siga de ahí). No hace falta tocarlo de nuevo después.
      </p>
      <form className="inline-form" onSubmit={handleCounterSubmit}>
        <input
          placeholder="Próximo número (solo el número, sin la A- ni los ceros)"
          type="number"
          value={nextNumberInput}
          onChange={(e) => setNextNumberInput(e.target.value)}
          required
        />
        {counterError && <div className="error-box">{counterError}</div>}
        <button type="submit">Guardar número</button>
      </form>

      <h1 style={{ marginTop: 40 }}>Fecha de cierre del resumen</h1>
      <p>
        {closingDay
          ? `El resumen cierra el día ${closingDay} de cada mes.`
          : "No hay fecha de cierre cargada: todas las órdenes entran en el resumen que les corresponde por su fecha."}
      </p>
      <p className="note">
        Funciona como el cierre de una tarjeta de crédito. Una orden de compra hecha hasta el día de cierre
        (inclusive) entra en el resumen normal; una hecha después de ese día pasa al resumen del mes siguiente.
        {closingDay
          ? ` Ejemplo con cierre el ${closingDay}: una orden del día ${closingDay} tiene su primera cuota en el resumen del mes siguiente; ${closingDay < 31 ? ` una del día ${closingDay + 1}, un mes después.` : ""}`
          : ""}{" "}
        Se aplica a las órdenes que se carguen (o cuya fecha se cambie) desde ahora; las que ya están cargadas no se mueven.
        Dejá el campo vacío para no usar fecha de cierre.
      </p>
      <form className="inline-form" onSubmit={handleClosingSubmit}>
        <input
          type="number" min={1} max={31}
          placeholder="Día de cierre (1 a 31)"
          value={closingInput}
          onChange={(e) => setClosingInput(e.target.value)}
        />
        {closingError && <div className="error-box">{closingError}</div>}
        {closingMsg && <span className="note" style={{ margin: 0 }}>{closingMsg}</span>}
        <button type="submit">Guardar día de cierre</button>
      </form>

      <h1 style={{ marginTop: 40 }}>Valor de cuota por tipo de socio</h1>
      <p className="note">
        Este valor se usa solo como precarga del campo "Valor de cuota" al dar de alta o editar
        un asociado — cambiarlo acá no modifica lo que ya tiene cargado cada asociado existente.
        <br />
        <b>Participantes:</b> pagan según el tipo de su titular. "Participante Activo" se aplica a los
        familiares Participante de un socio Activo y "Participante Adherente" a los de un socio Adherente.
        Estos dos valores se usan directamente en la liquidación a la empresa y se pueden cambiar cuando quieras.
      </p>
      {feeError && <div className="error-box">{feeError}</div>}
      <table className="data-table">
        <thead><tr><th>Tipo de socio</th><th>Valor de cuota</th><th></th></tr></thead>
        <tbody>
          {SOCIO_TYPES.map((t) => (
            <tr key={t}>
              <td>{t}</td>
              <td>
                <form className="inline-form" onSubmit={(e) => handleFeeSubmit(t, e)} style={{ margin: 0 }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="$"
                    value={feeInputs[t] ?? ""}
                    onChange={(e) => setFeeInputs({ ...feeInputs, [t]: e.target.value })}
                    style={{ width: 140 }}
                  />
                  <button type="submit" className="small-button">Guardar</button>
                  {feeSavedType === t && <span style={{ color: "var(--teal-bright, #2cc9bf)", marginLeft: 8 }}>Guardado</span>}
                </form>
              </td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h1 style={{ marginTop: 40 }}>Servicios</h1>
      <p className="note">
        Lista de servicios que se pueden asignar a un titular o a un familiar (pestaña Familiares de
        la ficha). El costo de acá es el sugerido: al asignarlo se puede cambiar para cada persona.
        Cada servicio asignado se detalla en la liquidación a la empresa.
      </p>
      {svcError && <div className="error-box">{svcError}</div>}
      <table className="data-table">
        <thead><tr><th>Servicio</th><th>Costo sugerido</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {serviceTypes.map((t) => (
            <tr key={t.id} style={t.active ? undefined : { opacity: 0.55 }}>
              <td>{t.name}</td>
              <td>
                <input type="number" step="0.01" min="0" style={{ width: 120 }} value={svcInputs[t.id] ?? ""}
                  onChange={(e) => setSvcInputs({ ...svcInputs, [t.id]: e.target.value })} />{" "}
                <button className="small-button"
                  onClick={() => svcAction(() => api.updateServiceType(t.id, { defaultAmount: Number(svcInputs[t.id] || 0) }))}>Guardar</button>
              </td>
              <td>{t.active ? "Activo" : "Inactivo"}</td>
              <td>
                <button className="small-button"
                  onClick={() => svcAction(() => api.updateServiceType(t.id, { active: !t.active }))}>
                  {t.active ? "Desactivar" : "Activar"}
                </button>
              </td>
            </tr>
          ))}
          {serviceTypes.length === 0 && <tr><td colSpan={4}>Todavía no hay servicios cargados.</td></tr>}
        </tbody>
      </table>
      <form className="inline-form" style={{ marginTop: 12 }} onSubmit={(e) => {
        e.preventDefault();
        svcAction(async () => {
          await api.createServiceType({ name: newSvcName.trim(), defaultAmount: Number(newSvcAmount || 0) });
          setNewSvcName(""); setNewSvcAmount("");
        });
      }}>
        <input placeholder="Nombre del servicio" value={newSvcName} onChange={(e) => setNewSvcName(e.target.value)} required />
        <input type="number" step="0.01" min="0" placeholder="Costo sugerido $" value={newSvcAmount}
          onChange={(e) => setNewSvcAmount(e.target.value)} style={{ width: 150 }} />
        <button type="submit">Agregar servicio</button>
      </form>
      </fieldset>
    </div>
  );
}
