import fs from "fs";
import path from "path";

// Resuelve la ruta al logo probando varias ubicaciones posibles: en
// desarrollo (ts-node-dev, corriendo desde src/) __dirname ya apunta bien,
// pero en producción (compilado a dist/, con tsc) los archivos que no son
// .ts no se copian solos a dist/ — así que probamos también la ruta
// basada en el directorio de trabajo (process.cwd(), que Render usa la
// carpeta backend/) apuntando directo a src/assets.
export function getLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, "..", "assets", "logo.png"),
    path.join(__dirname, "..", "..", "assets", "logo.png"),
    path.join(process.cwd(), "src", "assets", "logo.png"),
    path.join(process.cwd(), "assets", "logo.png"),
    path.join(process.cwd(), "dist", "assets", "logo.png"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Logo reducido (260 px) para incrustar en planillas Excel sin que el
// archivo pese casi 1 MB. Misma busqueda de ubicaciones que el logo grande.
export function getSmallLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, "..", "assets", "logo-excel.png"),
    path.join(__dirname, "..", "..", "assets", "logo-excel.png"),
    path.join(process.cwd(), "src", "assets", "logo-excel.png"),
    path.join(process.cwd(), "assets", "logo-excel.png"),
    path.join(process.cwd(), "dist", "assets", "logo-excel.png"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return getLogoPath();
}
