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
import Roles from "./pages/Roles";
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
  // Cada seccion se muestra segun los permisos del usuario (los de su rol
  // mas los individuales). El Administrador siempre tiene todo. El
  // backend igual vuelve a exigir cada permiso en cada endpoint.
  const can = (key: string) => isAdmin || permissions.includes(key);
  const canSettings = can("settings.manage");
  const canUsers = can("users.manage");
  const canCompanies = can("companies.manage");
  const canAudit = can("audit.view");
  const canAgreements = can("agreements.manage");
  const canInventory = can("inventory.manage");

  return (
    <Layout
      onLogout={handleLogout}
      isAdmin={isAdmin}
      canSettings={canSettings}
      canUsers={canUsers}
      canCompanies={canCompanies}
      canAudit={canAudit}
      canAgreements={canAgreements}
      canInventory={canInventory}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/afiliados" element={<AffiliatesList />} />
        <Route path="/afiliados/:id" element={<AffiliateProfile />} />
        {canSettings && <Route path="/configuracion" element={<Settings />} />}
        {canUsers && <Route path="/usuarios" element={<Users />} />}
        {canUsers && <Route path="/roles" element={<Roles />} />}
        {canCompanies && <Route path="/empresas" element={<Companies />} />}
        {canAudit && <Route path="/auditoria" element={<AuditLog />} />}
        {canAgreements && <Route path="/convenios" element={<Agreements />} />}
        {canInventory && <Route path="/inventario" element={<Inventory />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
