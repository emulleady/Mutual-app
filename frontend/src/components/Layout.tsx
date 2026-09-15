import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";

export default function Layout({
  children,
  onLogout,
  isAdmin,
}: {
  children: React.ReactNode;
  onLogout: () => void;
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const found = await api.searchAffiliates(query);
    setResults(found);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="Mutual Petrolero Privado" className="brand-logo" />
          <span>Mutual Petrolero Privado</span>
        </Link>
        <form className="search-form" onSubmit={handleSearch}>
          <input
            placeholder="Buscar por nombre, DNI o N° de afiliado..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">Buscar</button>
        </form>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/afiliados">Afiliados</Link>
          {isAdmin && <Link to="/configuracion">Configuración</Link>}
          {isAdmin && <Link to="/usuarios">Usuarios</Link>}
          {isAdmin && <Link to="/empresas">Empresas</Link>}
          {isAdmin && <Link to="/auditoria">Auditoría</Link>}
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
                setResults([]);
                setQuery("");
                navigate(`/afiliados/${r.id}`);
              }}
            >
              <strong>{r.lastName}, {r.firstName}</strong> — DNI {r.dni} — N° {r.affiliateNumber}
            </div>
          ))}
        </div>
      )}

      <aside className="side-banner side-banner-left">
        <img src="/logo.png" alt="Mutual Petrolero Privado" className="side-banner-logo" />
        <div className="side-banner-info">
          <p className="side-banner-title">Mutual Petrolero Privado</p>
          <p>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
            {" "}Ameghino 867, Río Grande, Tierra del Fuego
          </p>
          <p>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6.6 10.8c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.5.6 3.6.1.4 0 .8-.3 1.1l-2.2 2.1z"/></svg>
            {" "}2964 42-2060
          </p>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
