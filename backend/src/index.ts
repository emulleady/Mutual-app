import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./modules/auth/auth.routes";
import affiliatesRoutes from "./modules/affiliates/affiliates.routes";
import dashboardRoutes from "./modules/affiliates/dashboard.routes";
import loansRoutes from "./modules/loans/loans.routes";
import settingsRoutes from "./modules/settings/settings.routes";
import usersRoutes from "./modules/users/users.routes";
import companiesRoutes from "./modules/companies/companies.routes";
import auditRoutes from "./modules/audit/audit.routes";

const app = express();

// En producción (Render) solo se permite el dominio del frontend, para
// que ningún otro sitio pueda llamar a la API con las credenciales de
// un usuario logueado. En desarrollo local, sin FRONTEND_URL definida,
// se permite cualquier origen (para no trabar el proxy de Vite).
const frontendUrl = process.env.FRONTEND_URL;
app.use(cors(frontendUrl ? { origin: frontendUrl } : {}));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/affiliates", affiliatesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/loans", loansRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/audit", auditRoutes);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
