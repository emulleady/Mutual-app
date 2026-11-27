import { Link, useLocation, useNavigate } from "react-router-dom";
import { hasPermission } from "../utils/permissions";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

export default function Layout({
  children,
  onLogout,
  isAdmin,
  canSettings,
  canUsers,
  canCompanies,
  canAudit,
  canAgreements,
  canInventory,
  canFinance,
  canOrders,
  canPharmacy,
  pharmacyOnly,
}: {
  children: React.ReactNode;
  onLogout: () => void;
  isAdmin: boolean;
  canSettings?: boolean;
  canUsers?: boolean;
  canCompanies?: boolean;
  canAudit?: boolean;
  canAgreements?: boolean;
  canInventory?: boolean;
  canFinance?: boolean;
  canOrders?: boolean;
  canPharmacy?: boolean;
  pharmacyOnly?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [orderResults, setOrderResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  // Buscador en vivo: el indice de asociados se baja una vez (y se renueva cada 5 minutos)
  // y se filtra en el navegador a cada letra, igual que el buscador de Empresas: sin
  // distinguir mayusculas ni tildes, sin comas y con las palabras en cualquier orden.
  const indexRef = useRef<{ at: number; rows: any[] } | null>(null);
  const fold = (v: any) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  async function loadIndex() {
    if (indexRef.current && Date.now() - indexRef.current.at < 300000) return indexRef.current.rows;
    const raw: any[] = await api.searchIndex().catch(() => []);
    const rows = raw.map((r) => ({
      ...r,
      hay: fold([r.affiliateNumber, r.lastName, r.firstName, r.dni, r.cuil, r.phone, r.email, ...(r.dependents || []).flatMap((d: any) => [d.fullName, d.dni])].join(" ")),
    }));
    indexRef.current = { at: Date.now(), rows };
    return rows;
  }

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResults([]);
      setOrderResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    const terms = fold(text.replace(/[,;]/g, " ")).split(/\s+/).filter(Boolean);
    (async () => {
      const rows = await loadIndex();
      if (cancelled) return;
      setResults(rows.filter((r) => terms.every((t) => r.hay.includes(t))).slice(0, 20));
      setSearched(true);
    })();
    const timer = setTimeout(async () => {
      if (!hasPermission("orders.view") || text.length < 2) {
        setOrderResults([]);
        return;
      }
      const orders = await api.searchLoans(text).catch(() => []);
      if (!cancelled) setOrderResults(orders);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
  }

  function closeSearch() {
    setResults([]);
    setOrderResults([]);
    setSearched(false);
    setQuery("");
  }

  const hasResults = results.length > 0 || orderResults.length > 0;
  const orderList = orderResults.length > 0 && (
    <>
      <div className="search-result-meta" style={{ padding: "6px 12px", fontWeight: 600 }}>Órdenes de compra</div>
      {orderResults.map((o) => (
        <div
          key={`o${o.id}`}
          className="search-result-item"
          onClick={() => {
            closeSearch();
            navigate(`/afiliados/${o.affiliate.id}?tab=prestamos`);
          }}
        >
          <span className="search-result-name">Orden {o.orderNumber}</span>
          <span className="search-result-meta">
            <span>{o.affiliate.lastName} {o.affiliate.firstName}</span>
            <span>{new Date(o.grantedAt).toLocaleDateString("es-AR")}</span>
          </span>
        </div>
      ))}
    </>
  );

  const isActive = (to: string) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to));
  type MenuLink = { to: string; label: string };
  const tesoreria: MenuLink[] = [
    ...(canFinance ? [{ to: "/caja", label: "Caja" }, { to: "/cobranzas", label: "Cobranzas" }] : []),
  ];
  const administracion: MenuLink[] = [
    ...(canSettings ? [{ to: "/configuracion", label: "Configuración" }] : []),
    ...(canUsers ? [{ to: "/usuarios", label: "Usuarios" }, { to: "/roles", label: "Roles" }] : []),
    ...(canAudit ? [{ to: "/auditoria", label: "Auditoría" }] : []),
  ];
  // Menu del panel lateral: accesos directos y grupos (Tesoreria, Administracion).
  const menu: ({ to: string; label: string } | { group: string; items: MenuLink[] })[] = [
    ...(isAdmin ? [{ to: "/", label: "Resumen" }] : []),
    ...(canCompanies ? [{ to: "/empresas", label: "Empresas" }] : []),
    ...(canPharmacy ? [{ to: "/farmacia", label: "Farmacia" }] : []),
    ...(canInventory ? [{ to: "/inventario", label: "Inventario" }] : []),
    ...(!pharmacyOnly ? [{ to: "/deporte", label: "Deporte" }] : []),
    ...(tesoreria.length ? [{ group: "Tesorería", items: tesoreria }] : []),
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to={pharmacyOnly ? "/farmacia" : isAdmin ? "/" : "/afiliados"} className="brand">
          <img src="/logo.png" alt="Mutual Petrolero Privado" className="brand-logo" />
          <span>Mutual Petrolero Privado</span>
        </Link>
        {!pharmacyOnly && (
        <div className="search-wrapper">
          <form className="search-form" onSubmit={handleSearch}>
            <input
              placeholder="Buscar por nombre, DNI, N° de asociado o N° de orden..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit">Buscar</button>
          </form>

          {(hasResults || searched) && (
            <div className="search-results">
              {!hasResults && <div className="search-result-item">Sin resultados</div>}
              {orderList}
              {results.length > 0 && orderResults.length > 0 && (
                <div className="search-result-meta" style={{ padding: "6px 12px", fontWeight: 600 }}>Asociados</div>
              )}
              {results.map((r) => (
                <div
                  key={r.id}
                  className="search-result-item"
                  onClick={() => {
                    closeSearch();
                    navigate(`/afiliados/${r.id}`);
                  }}
                >
                  <span className="search-result-name">{r.lastName} {r.firstName}</span>
                  <span className="search-result-meta">
                    <span>DNI {r.dni}</span>
                    <span>N° {r.affiliateNumber}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
        <nav className="top-links">
          {/* Pantallas anchas: Asociados, Órdenes y Administración quedan arriba; el resto en el panel lateral. */}
          <div className="top-main">
            {!pharmacyOnly && <Link to="/afiliados" className={isActive("/afiliados") ? "on" : ""}>Asociados</Link>}
            {canOrders && <Link to="/ordenes" className={isActive("/ordenes") ? "on" : ""}>Órdenes de compra</Link>}
            {canAgreements && <Link to="/convenios" className={isActive("/convenios") ? "on" : ""}>Convenios</Link>}
            {administracion.length > 0 && (
              <div className="top-drop" tabIndex={0}>
                <span className={administracion.some((it) => isActive(it.to)) ? "top-drop-label on" : "top-drop-label"}>Administración ▾</span>
                <div className="top-drop-menu">
                  {administracion.map((it) => (
                    <Link key={it.to} to={it.to}>{it.label}</Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          {isAdmin && <Link to="/">Resumen</Link>}
          {!pharmacyOnly && <Link to="/afiliados">Asociados</Link>}
          {canPharmacy && <Link to="/farmacia">Farmacia</Link>}
          {canOrders && <Link to="/ordenes">Órdenes</Link>}
          {canSettings && <Link to="/configuracion">Configuración</Link>}
          {canUsers && <Link to="/usuarios">Usuarios</Link>}
          {canUsers && <Link to="/roles">Roles</Link>}
          {canCompanies && <Link to="/empresas">Empresas</Link>}
          {canAudit && <Link to="/auditoria">Auditoría</Link>}
          {canAgreements && <Link to="/convenios">Convenios</Link>}
          {!pharmacyOnly && <Link to="/deporte">Deporte</Link>}
          {canInventory && <Link to="/inventario">Inventario</Link>}
          {canFinance && <Link to="/cobranzas">Cobranzas</Link>}
          {canFinance && <Link to="/caja">Caja</Link>}
          <button className="link-button" onClick={onLogout}>Salir</button>
        </nav>
      </header>

      {results.length > 0 && (
        <div className="search-results">
          {results.map((r) => (
            <div
              key={r.id}
              className="search-result-item"
              onClick={() => {
                closeSearch();
                navigate(`/afiliados/${r.id}`);
              }}
            >
              <strong>{r.lastName} {r.firstName}</strong> — DNI {r.dni} — N° {r.affiliateNumber}
            </div>
          ))}
        </div>
      )}

      <aside className="side-banner side-banner-left">
        <img src="/logo.png" alt="Mutual Petrolero Privado" className="side-banner-logo" />
        <div className="side-banner-info">
          <p className="side-banner-title">Mutual Petrolero Privado</p>
        </div>

        <nav className="side-menu" aria-label="Menú principal">
          {menu.map((entry, i) =>
            "to" in entry ? (
              <Link key={i} to={entry.to} className={isActive(entry.to) ? "side-link active" : "side-link"}>{entry.label}</Link>
            ) : (
              <details key={i} open={entry.items.some((it) => isActive(it.to)) || undefined}>
                <summary>{entry.group}</summary>
                {entry.items.map((it) => (
                  <Link key={it.to} to={it.to} className={isActive(it.to) ? "side-link sub active" : "side-link sub"}>{it.label}</Link>
                ))}
              </details>
            )
          )}
        </nav>

        <div className="side-banner-contact">
          <span>Ameghino 867, Río Grande, Tierra del Fuego</span>
          <span>Tel. 2964 42-2060</span>
        </div>
      </aside>

      <main className="content">
        {location.pathname !== "/" && (
          <button className="link-button-dark" style={{ marginBottom: 12 }} onClick={() => navigate(-1)} title="Volver a la pantalla anterior">
            ← Atrás
          </button>
        )}
        {children}
      </main>
    </div>
  );
}
