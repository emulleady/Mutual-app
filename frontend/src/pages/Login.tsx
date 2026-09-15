import { useState } from "react";
import { api } from "../api/client";

export default function Login({ onLogin }: { onLogin: (token: string, role: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login(username, password);
      onLogin(data.token, data.user.role);
    } catch (err: any) {
      setError(err.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src="/logo.png" alt="Mutual Petrolero Privado" className="login-logo" />
        <h1>Mutual Petrolero Privado</h1>
        <p className="subtitle">Gestión de afiliados — Tierra del Fuego</p>

        <label>Usuario</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />

        <label>Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

        {error && <div className="error-box">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
