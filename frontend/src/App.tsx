import { Navigate, Route, Routes } from "react-router-dom";
import { useState } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AffiliatesList from "./pages/AffiliatesList";
import AffiliateProfile from "./pages/AffiliateProfile";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import Companies from "./pages/Companies";
import AuditLog from "./pages/AuditLog";
import Agreements from "./pages/Agreements";
import Inventory from "./pages/Inventory";
import Layout from "./components/Layout";

function loadPermissions(): string[] {
  try {
    return JSON.parse(localStorage.getItem("permissions") || "[]");
  } catch {
    return [];
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [role, setRole] = useState<string | null>(localStorage.getItem("role"));
  const [permissions, setPermissions] = useState<string[]>(loadPermissions());

  function handleLogin(t: string, userRole: string, userPermissions: string[]) {
    localStorage.setItem("token", t);
    localStorage.setItem("role", userRole);
    localStorage.setItem("permissions", JSON.stringify(userPermissions));
    setToken(t);
    setRole(userRole);
    setPermissions(userPermissions);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("permissions");
    setToken(null);
    setRole(null);
    setPermissions([]);
  }

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  const isAdmin = role === "Administrador";
  // Inventario lo puede usar el Administrador, o cualquier usuario al que
  // se le haya otorgado el permiso individual "inventory.manage" (por
  // ejemplo Matías) desde Usuarios → permisos individuales.
  const canInventory = isAdmin || permissions.includes("inventory.manage");

  return (
    <Layout onLogout={handleLogout} isAdmin={isAdmin} canInventory={canInventory}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/afiliados" element={<AffiliatesList />} />
        <Route path="/afiliados/:id" element={<AffiliateProfile />} />
        {isAdmin && <Route path="/configuracion" element={<Settings />} />}
        {isAdmin && <Route path="/usuarios" element={<Users />} />}
        {isAdmin && <Route path="/empresas" element={<Companies />} />}
        {isAdmin && <Route path="/auditoria" element={<AuditLog />} />}
        {isAdmin && <Route path="/convenios" element={<Agreements />} />}
        {canInventory && <Route path="/inventario" element={<Inventory />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
