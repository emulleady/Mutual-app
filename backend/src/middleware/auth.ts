import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    roleId: number;
    roleName: string;
  };
}

// Verifica el JWT y adjunta el usuario autenticado al request.
// Cualquier endpoint que necesite proteccion debe usar este middleware
// ANTES de la logica de negocio: la verificacion de permisos nunca
// depende solo del frontend.
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as {
      userId: number;
    };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true },
    });

    if (!user || !user.active) {
      return res.status(401).json({ error: "Usuario inactivo o inexistente" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      roleId: user.roleId,
      roleName: user.role.name,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Token invalido o expirado" });
  }
}

// Middleware de autorizacion: exige que el rol del usuario tenga el
// permiso indicado. Se verifica en el backend, no alcanza con ocultar
// botones en el frontend.
export function requirePermission(permissionKey: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const hasPermission = await prisma.rolePermission.findFirst({
      where: {
        roleId: req.user.roleId,
        permission: { key: permissionKey },
      },
    });

    if (!hasPermission) {
      return res.status(403).json({ error: "No tiene permiso para esta accion" });
    }

    next();
  };
}
