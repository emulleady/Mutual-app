import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import LoanPanel from "../components/LoanPanel";
import { affiliateStatusLabels, translate } from "../utils/labels";

type Tab = "resumen" | "datos" | "prestamos" | "familiares" | "historial";

export default function AffiliateProfile() {
  const { id } = useParams();
  const [affiliate, setAffiliate] = useState<any | null>(null);
  const [tab, setTab] = useState<Tab>("resumen");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showDependentForm, setShowDependentForm] = useState(false);
  const [dependentForm, setDependentForm] = useState({
    fullName: "", dni: "", cuil: "", dependentNumber: "", parentesco: "Cónyuge", parentescoOtro: "", birthDate: "",
    address: "", addressNumber: "", addressType: "", floorApt: "", locality: "", province: "", phone: "", email: "",
  });
  const [dependentError, setDependentError] = useState<string | null>(null);

  function load() {
    if (id) api.getAffiliate(Number(id)).then(setAffiliate).catch(() => {});
  }

  useEffect(load, [id]);
  useEffect(() => { api.listCompanies().then(setCompanies).catch(() => {}); }, []);

  function startEditing() {
    setForm({
      firstName: affiliate.firstName,
      lastName: affiliate.lastName,
      dni: affiliate.dni,
      cuil: affiliate.cuil || "",
      address: affiliate.address || "",
      addressNumber: affiliate.addressNumber || "",
      addressType: affiliate.addressType || "",
      floorApt: affiliate.floorApt || "",
      locality: affiliate.locality || "",
      province: affiliate.province || "",
      phone: affiliate.phone || "",
      email: affiliate.email || "",
      birthDate: affiliate.birthDate ? affiliate.birthDate.slice(0, 10) : "",
      companyId: affiliate.companyId ?? "",
      yacimiento: affiliate.yacimiento || "",
      puesto: affiliate.puesto || "",
      healthProvider: affiliate.healthProvider || "",
      coveragePercentage: affiliate.coveragePercentage || "",
      socioType: affiliate.socioType || "",
    });
    setError(null);
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.updateAffiliate(affiliate.id, {
        ...form,
        birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : null,
        companyId: form.companyId ? Number(form.companyId) : null,
      });
      setEditing(false);
      load();
    } catch (err: any) {
      setError(err.message || "No se pudieron guardar los cambios");
    }
  }

  async function handleToggleStatus() {
    if (affiliate.status === "active") {
      if (!window.confirm("¿Dar de baja a este afiliado? No se pierde su historial.")) return;
      await api.deactivateAffiliate(affiliate.id);
    } else {
      await api.activateAffiliate(affiliate.id);
    }
    load();
  }

  async function handleAddDependent(e: React.FormEvent) {
    e.preventDefault();
    setDependentError(null);
    const parentesco = dependentForm.parentesco === "Otro" ? dependentForm.parentescoOtro : dependentForm.parentesco;
    if (!parentesco) {
      setDependentError("Indicá el parentesco");
      return;
    }
    try {
      await api.createDependent(affiliate.id, {
        fullName: dependentForm.fullName,
        dni: dependentForm.dni || null,
        cuil: dependentForm.cuil || null,
        dependentNumber: dependentForm.dependentNumber || null,
        parentesco,
        birthDate: dependentForm.birthDate ? new Date(dependentForm.birthDate).toISOString() : null,
        address: dependentForm.address || null,
        addressNumber: dependentForm.addressNumber || null,
        addressType: dependentForm.addressType || null,
        floorApt: dependentForm.floorApt || null,
        locality: dependentForm.locality || null,
        province: dependentForm.province || null,
        phone: dependentForm.phone || null,
        email: dependentForm.email || null,
      });
      setShowDependentForm(false);
      setDependentForm({
        fullName: "", dni: "", cuil: "", dependentNumber: "", parentesco: "Cónyuge", parentescoOtro: "", birthDate: "",
        address: "", addressNumber: "", addressType: "", floorApt: "", locality: "", province: "", phone: "", email: "",
      });
      load();
    } catch (err: any) {
      setDependentError(err.message || "No se pudo agregar el familiar");
    }
  }

  if (!affiliate) return <p>Cargando...</p>;

  return (
    <div>
      <div className="affiliate-header">
        <div>
          <h1>{affiliate.lastName}, {affiliate.firstName}</h1>
          <p>DNI: {affiliate.dni} — N° de afiliado: {affiliate.affiliateNumber}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className={`badge badge-${affiliate.status}`}>{translate(affiliateStatusLabels, affiliate.status)}</span>
          <button className="small-button" onClick={() => api.downloadFichaAlta(affiliate.id, `${affiliate.lastName}-${affiliate.firstName}`)}>
            Ficha de Alta (PDF)
          </button>
          <button className="small-button" onClick={handleToggleStatus}>
            {affiliate.status === "active" ? "Dar de baja" : "Reactivar"}
          </button>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === "resumen" ? "active" : ""} onClick={() => setTab("resumen")}>Resumen</button>
        <button className={tab === "datos" ? "active" : ""} onClick={() => setTab("datos")}>Datos personales</button>
        <button className={tab === "prestamos" ? "active" : ""} onClick={() => setTab("prestamos")}>Préstamos</button>
        <button className={tab === "familiares" ? "active" : ""} onClick={() => setTab("familiares")}>Familiares</button>
        <button className={tab === "historial" ? "active" : ""} onClick={() => setTab("historial")}>Historial</button>
      </div>

      {tab === "resumen" && (
        <div className="tab-panel">
          <p>Sucursal: {affiliate.branch?.name || "—"}</p>
          <p>Empresa donde trabaja: {affiliate.company?.name || "—"}</p>
          <p>Yacimiento: {affiliate.yacimiento || "—"} — Puesto: {affiliate.puesto || "—"}</p>
          <p>Obra social: {affiliate.healthProvider || "—"} ({affiliate.coveragePercentage || "—"})</p>
          <p>Familiares a cargo: {affiliate.dependents?.length ?? 0}</p>
          <p>Afiliado desde: {new Date(affiliate.createdAt).toLocaleDateString("es-AR")}</p>
          <p className="note">
            Los módulos de servicios y beneficios se incorporan en las etapas
            siguientes del proyecto y se sumarán a este resumen.
          </p>
        </div>
      )}

      {tab === "datos" && (
        <div className="tab-panel">
          {!editing ? (
            <>
              <dl className="data-list">
                <dt>Nombre</dt><dd>{affiliate.firstName}</dd>
                <dt>Apellido</dt><dd>{affiliate.lastName}</dd>
                <dt>DNI</dt><dd>{affiliate.dni}</dd>
                <dt>CUIL</dt><dd>{affiliate.cuil || "—"}</dd>
                <dt>Fecha de nacimiento</dt>
                <dd>{affiliate.birthDate ? new Date(affiliate.birthDate).toLocaleDateString("es-AR") : "—"}</dd>
                <dt>Dirección</dt><dd>{affiliate.address || "—"} {affiliate.addressNumber ? `N° ${affiliate.addressNumber}` : ""} {affiliate.addressType ? `(${affiliate.addressType})` : ""} {affiliate.floorApt ? `- Piso ${affiliate.floorApt}` : ""}</dd>
                <dt>Tipo de socio</dt><dd>{affiliate.socioType || "—"}</dd>
                <dt>Localidad</dt><dd>{affiliate.locality || "—"}, {affiliate.province || "—"}</dd>
                <dt>Teléfono</dt><dd>{affiliate.phone || "—"}</dd>
                <dt>Email</dt><dd>{affiliate.email || "—"}</dd>
                <dt>Empresa</dt><dd>{affiliate.company?.name || "—"}</dd>
                <dt>Yacimiento</dt><dd>{affiliate.yacimiento || "—"}</dd>
                <dt>Puesto</dt><dd>{affiliate.puesto || "—"}</dd>
                <dt>Obra social</dt><dd>{affiliate.healthProvider || "—"} ({affiliate.coveragePercentage || "—"})</dd>
                <dt>Fecha de alta</dt><dd>{new Date(affiliate.createdAt).toLocaleDateString("es-AR")}</dd>
              </dl>
              <button style={{ marginTop: 16 }} onClick={startEditing}>Editar datos</button>
            </>
          ) : (
            <form className="inline-form" onSubmit={handleSave} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <label>Nombre</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              <label>Apellido</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              <label>DNI</label>
              <input value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} required />
              <label>CUIL</label>
              <input value={form.cuil} onChange={(e) => setForm({ ...form, cuil: e.target.value })} />
              <label>Fecha de nacimiento</label>
              <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
              <label>Dirección (calle)</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <label>N° de puerta</label>
              <input value={form.addressNumber} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} />
              <label>Tipo</label>
              <select value={form.addressType} onChange={(e) => setForm({ ...form, addressType: e.target.value })}>
                <option value="">Sin especificar</option>
                <option value="Casa">Casa</option>
                <option value="Dpto">Dpto.</option>
              </select>
              <label>Piso y Dpto</label>
              <input value={form.floorApt} onChange={(e) => setForm({ ...form, floorApt: e.target.value })} />
              <label>Localidad</label>
              <input value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} />
              <label>Provincia</label>
              <input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
              <label>Teléfono</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <label>Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <label>Empresa donde trabaja</label>
              <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                <option value="">Sin empresa asignada</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label>Yacimiento</label>
              <input value={form.yacimiento} onChange={(e) => setForm({ ...form, yacimiento: e.target.value })} />
              <label>Puesto</label>
              <input value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })} />
              <label>Obra social</label>
              <input value={form.healthProvider} onChange={(e) => setForm({ ...form, healthProvider: e.target.value })} />
              <label>Cobertura (Al 100% - 60%)</label>
              <input value={form.coveragePercentage} onChange={(e) => setForm({ ...form, coveragePercentage: e.target.value })} />
              <label>Tipo de socio</label>
              <input value={form.socioType} onChange={(e) => setForm({ ...form, socioType: e.target.value })} />
              {error && <div className="error-box">{error}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="submit">Guardar cambios</button>
                <button type="button" className="small-button" onClick={() => setEditing(false)}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
      )}

      {tab === "prestamos" && (
        <div className="tab-panel">
          <LoanPanel affiliateId={affiliate.id} />
        </div>
      )}

      {tab === "familiares" && (
        <div className="tab-panel">
          <div className="page-header">
            <h3>Familiares a cargo</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="small-button" onClick={() => api.downloadFichaFamiliares(affiliate.id, `${affiliate.lastName}-${affiliate.firstName}`)}>
                Ficha de Familiares (PDF)
              </button>
              <button onClick={() => setShowDependentForm((v) => !v)}>
                {showDependentForm ? "Cancelar" : "Agregar familiar"}
              </button>
            </div>
          </div>

          {showDependentForm && (
            <form className="inline-form" onSubmit={handleAddDependent}>
              <input placeholder="Nombre completo" value={dependentForm.fullName}
                onChange={(e) => setDependentForm({ ...dependentForm, fullName: e.target.value })} required />
              <input placeholder="N° de afiliado (opcional)" value={dependentForm.dependentNumber}
                onChange={(e) => setDependentForm({ ...dependentForm, dependentNumber: e.target.value })} />
              <input placeholder="DNI (opcional)" value={dependentForm.dni}
                onChange={(e) => setDependentForm({ ...dependentForm, dni: e.target.value })} />
              <select value={dependentForm.parentesco}
                onChange={(e) => setDependentForm({ ...dependentForm, parentesco: e.target.value })}>
                <option value="Cónyuge">Cónyuge</option>
                <option value="Esposo/a">Esposo/a</option>
                <option value="Hijo/a">Hijo/a</option>
                <option value="Otro">Otro</option>
              </select>
              {dependentForm.parentesco === "Otro" && (
                <input placeholder="Especificar parentesco" value={dependentForm.parentescoOtro}
                  onChange={(e) => setDependentForm({ ...dependentForm, parentescoOtro: e.target.value })} required />
              )}
              <input type="date" value={dependentForm.birthDate}
                onChange={(e) => setDependentForm({ ...dependentForm, birthDate: e.target.value })} />
              <input placeholder="CUIL" value={dependentForm.cuil}
                onChange={(e) => setDependentForm({ ...dependentForm, cuil: e.target.value })} />
              <input placeholder="Domicilio (calle)" value={dependentForm.address}
                onChange={(e) => setDependentForm({ ...dependentForm, address: e.target.value })} />
              <input placeholder="N° de puerta" value={dependentForm.addressNumber}
                onChange={(e) => setDependentForm({ ...dependentForm, addressNumber: e.target.value })} />
              <select value={dependentForm.addressType}
                onChange={(e) => setDependentForm({ ...dependentForm, addressType: e.target.value })}>
                <option value="">Casa/Dpto</option>
                <option value="Casa">Casa</option>
                <option value="Dpto">Dpto.</option>
              </select>
              <input placeholder="Piso" value={dependentForm.floorApt}
                onChange={(e) => setDependentForm({ ...dependentForm, floorApt: e.target.value })} />
              <input placeholder="Localidad" value={dependentForm.locality}
                onChange={(e) => setDependentForm({ ...dependentForm, locality: e.target.value })} />
              <input placeholder="Provincia" value={dependentForm.province}
                onChange={(e) => setDependentForm({ ...dependentForm, province: e.target.value })} />
              <input placeholder="Teléfono" value={dependentForm.phone}
                onChange={(e) => setDependentForm({ ...dependentForm, phone: e.target.value })} />
              <input placeholder="Email" value={dependentForm.email}
                onChange={(e) => setDependentForm({ ...dependentForm, email: e.target.value })} />
              {dependentError && <div className="error-box">{dependentError}</div>}
              <button type="submit">Guardar</button>
            </form>
          )}

          <table className="data-table">
            <thead><tr><th>N° afiliado</th><th>Nombre</th><th>Parentesco</th><th>DNI</th><th>Obra social</th><th>Cobertura</th></tr></thead>
            <tbody>
              {(affiliate.dependents || []).map((d: any) => (
                <tr key={d.id}>
                  <td>{d.dependentNumber || "—"}</td>
                  <td>{d.fullName}</td>
                  <td>{d.parentesco}</td>
                  <td>{d.dni || "—"}</td>
                  <td>{d.healthProvider || "—"}</td>
                  <td>{d.coveragePercentage || "—"}</td>
                </tr>
              ))}
              {(!affiliate.dependents || affiliate.dependents.length === 0) && (
                <tr><td colSpan={6}>Sin familiares a cargo cargados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "historial" && (
        <div className="tab-panel">
          <ul className="timeline">
            {affiliate.events.map((e: any) => (
              <li key={e.id}>
                <span className="timeline-date">{new Date(e.occurredAt).toLocaleDateString("es-AR")}</span>
                <span>{e.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
