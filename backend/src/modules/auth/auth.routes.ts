import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../db";
import { logAudit } from "../../middleware/audit";

const router = Router();

// Login: valida usuario/contraseña, devuelve JWT.
// No revela si fallo el usuario o la contraseña (mismo mensaje genérico)
// para no facilitar enumeracion de usuarios validos.
router.post("/login", async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };

  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña son obligatorios" });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  });

  const genericError = { error: "Usuario o contraseña incorrectos" };

  if (!user || !user.active) {
    return res.status(401).json(genericError);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json(genericError);
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30m",
  } as jwt.SignOptions);

  await logAudit({
    userId: user.id,
    action: "login",
    entityType: "user",
    entityId: user.id,
    ipAddress: req.ip,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role.name,
    },
  });
});

export default router;
