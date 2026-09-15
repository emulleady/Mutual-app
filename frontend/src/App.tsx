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
import Layout from "./components/Layout";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [role, setRole] = useState<string | null>(localStorage.getItem("role"));

  function handleLogin(t: string, userRole: string) {
    localStorage.setItem("token", t);
    localStorage.setItem("role", userRole);
    setToken(t);
    setRole(userRole);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    setToken(null);
    setRole(null);
  }

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  const isAdmin = role === "Administrador";

  return (
    <Layout onLogout={handleLogout} isAdmin={isAdmin}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/afiliados" element={<AffiliatesList />} />
        <Route path="/afiliados/:id" element={<AffiliateProfile />} />
        {isAdmin && <Route path="/configuracion" element={<Settings />} />}
        {isAdmin && <Route path="/usuarios" element={<Users />} />}
        {isAdmin && <Route path="/empresas" element={<Companies />} />}
        {isAdmin && <Route path="/auditoria" element={<AuditLog />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
