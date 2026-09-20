# Sistema Integral de Gestión de Afiliados — Etapa 1 + Etapa 2

Etapa 1 (base): login, roles y permisos, CRUD de afiliados, buscador
global, ficha con pestañas Resumen / Datos personales / Historial,
dashboard y auditoría automática.

Etapa 2 (préstamos), agregada ahora:

- Alta de préstamo: se generan automáticamente todas las cuotas con su
  fecha de vencimiento mensual.
- Pestaña "Préstamos" en la ficha del afiliado, separada en activos e
  historial (misma tabla, filtrada por estado — nada se borra).
- Registro de pagos por cuota (una cuota puede pagarse en partes).
- Al pagar la última cuota, el préstamo pasa a "cancelado" (saldado)
  automáticamente.
- **Mora con tasa configurable**: pantalla de Configuración (solo para el
  rol Administrador) donde se carga la tasa de interés diaria o mensual.
  El sistema detecta las cuotas vencidas sin pago, las marca "En mora" y
  calcula el interés acumulado usando la tasa que estaba vigente al
  momento del vencimiento de cada cuota — si el administrador cambia la
  tasa después, las moras ya generadas no se recalculan con la tasa nueva.
  Queda historial completo de qué tasa rigió en cada período.

Lo que **no** está todavía (llega en las siguientes etapas): servicios,
beneficios, reportes, importación de Excel/CSV.

## Módulo de usuarios (agregado)

Pantalla "Usuarios" (solo Administrador): alta de secretarios/administradores,
activar/desactivar, restablecer contraseña. Nunca se borra un usuario —
se desactiva, para no perder la referencia en la auditoría de lo que hizo.

## Importación de Excel (agregado)

Botón "Importar Excel" en la pantalla de Afiliados. Espera un archivo con
las columnas EXACTAMENTE en este orden (A a X), tal cual la planilla de
la mutual:

```
Nº Asociado | Apellido y Nombre | DNI | CUIL | Empresa | Yacimiento | Puesto |
Fecha Ingreso | Baja | Fecha Alta nuevo | Baja | Activos | Parentesco |
Fecha Naci | Obra Social | Al 100% - 60% | Fecha Ingreso | Estado |
Domicilio | Piso y Dpto | Localidad | Provincia | Telefono | Email
```

Cómo se interpreta cada fila:
- Si la columna "Parentesco" está vacía o dice "Titular" → es un afiliado
  titular (se crea/actualiza en `affiliates`, buscando por Nº Asociado).
- Si tiene otro valor (Cónyuge, Hijo/a, etc.) → es un familiar a cargo,
  se guarda en `dependents` asociado al titular con el mismo Nº Asociado.
- "Apellido y Nombre" se separa en apellido/nombre por la coma
  ("Apellido, Nombre"). Si una fila no tiene coma, se avisa en el
  resultado para revisar a mano — no bloquea el resto de la importación.
- La empresa (columna "Empresa") se busca por nombre y se crea sola si
  no existía todavía.
- Una fila con error (falta DNI, falta Nº Asociado, etc.) se informa en
  el resultado y se salta — el resto de la planilla se importa igual.
- Importar la misma planilla de nuevo actualiza los registros existentes
  (por Nº Asociado / DNI) en vez de duplicarlos.

Nueva pestaña "Familiares" en la ficha del afiliado, con la lista de
familiares a cargo importados.

## Auditoría (agregado)

Pantalla "Auditoría" (solo Administrador): registro de solo lectura de
toda acción de escritura del sistema (quién, cuándo, qué cambió, antes/
después), con filtros por usuario, tipo de entidad y rango de fechas.
Nadie puede editar ni borrar estas entradas desde ningún endpoint, ni
siquiera el administrador — es la tabla `audit_logs` que ya se venía
llenando desde la Etapa 1, ahora con pantalla para consultarla.

## Reporte para las empresas (agregado)

En la ficha de cada empresa (Empresas → clic en una empresa), dos botones:
"Descargar Excel" y "Descargar PDF". Generan un listado de todos los
afiliados que trabajan en esa empresa con su estado (Activo/Inactivo) y
su deuda total (saldo pendiente + mora acumulada de préstamos activos),
listo para enviarle a la empresa. El PDF sale con membrete de la mutual
(logo, dirección y teléfono).

## Módulo de empresas (agregado)

Pantalla "Empresas" (solo Administrador): la empresa petrolera donde
trabaja cada afiliado, para el descuento por recibo de sueldo. Se
selecciona al cargar o editar un afiliado, y se ve en la ficha (Resumen
y Datos personales). Los estados de afiliados, préstamos y cuotas ahora
se muestran en español en toda la interfaz (antes aparecían en inglés).

## Cómo correrlo localmente

Requisitos: Node.js 18 o superior.

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma db push
npm run seed
npm run dev
```

Si ya tenías el backend corriendo y el schema cambió (por un archivo
nuevo que te haya pasado): pará el servidor (Ctrl+C), corré
`npx prisma db push` de nuevo para sincronizar las tablas sin perder
los datos ya cargados, y volvé a correr `npm run dev`.

Esto levanta la API en `http://localhost:4000`. La base de datos es SQLite
(un archivo `dev.db`) para poder probar sin instalar nada más — para producción,
cambiar `provider = "sqlite"` por `provider = "postgresql"` en
`backend/prisma/schema.prisma` y apuntar `DATABASE_URL` a tu servidor Postgres.

El seed crea un usuario administrador:
- **Usuario:** `admin`
- **Contraseña:** `Admin123!`

Cambiá esta contraseña como primer paso una vez que tengas el módulo de
usuarios de la Etapa siguiente, o actualízala directamente en la base de datos.

### 2. Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Esto levanta la interfaz en `http://localhost:5173` (con proxy automático
hacia la API en el puerto 4000).

## Estructura

```
backend/
  prisma/schema.prisma   → modelo de datos (Etapa 1: users, roles, permissions,
                            affiliates, affiliate_events, audit_logs)
  prisma/seed.ts         → crea roles, permisos y el usuario admin inicial
  src/middleware/        → autenticación (JWT) y auditoría
  src/modules/auth/      → login
  src/modules/affiliates/→ CRUD, buscador, ficha, dashboard
  src/modules/loans/     → alta de préstamo, cuotas, pagos, cálculo de mora
  src/modules/settings/  → tasa de interés por mora (historial de valores)

frontend/
  src/pages/             → Login, Dashboard, Listado de afiliados, Ficha del afiliado, Configuración
  src/components/Layout  → barra superior + buscador global
  src/components/LoanPanel → pestaña "Préstamos" dentro de la ficha
  src/api/client.ts      → llamadas a la API
```

## Próxima etapa

Etapa 3: servicios y beneficios (catálogos, alta/baja por afiliado,
utilización de beneficios), integrados como nuevas pestañas de la ficha.

## Publicar en Render

El proyecto usa PostgreSQL (no SQLite) para producción. Se publican tres
piezas separadas en Render: base de datos, backend (Web Service) y
frontend (Static Site).

1. **Base de datos**: Render → New → PostgreSQL. Cuando esté lista, copiá
   la "Internal Database URL".
2. **Backend**: Render → New → Web Service, apuntando a la carpeta
   `backend` del repositorio. Build Command: `npm install && npm run build`.
   Start Command: `npm start`. Variables de entorno:
   - `DATABASE_URL`: la Internal Database URL del paso 1.
   - `JWT_SECRET`: un texto largo y aleatorio.
   - `JWT_EXPIRES_IN`: `30m` (o más, ver nota abajo).
   - `FRONTEND_URL`: la URL del Static Site del paso 3 (se completa
     después de crearlo).

   El build corre `prisma db push` solo, así que las tablas se
   crean solas en el primer deploy. Para crear el usuario administrador
   inicial, abrí la pestaña "Shell" del servicio en Render y corré
   `npm run seed` una sola vez.
3. **Frontend**: Render → New → Static Site, apuntando a la carpeta
   `frontend`. Build Command: `npm install && npm run build`. Publish
   Directory: `dist`. Variable de entorno: `VITE_API_URL` con la URL
   del backend del paso 2 + `/api` (ej. `https://tu-backend.onrender.com/api`).

Después de crear el Static Site, volvé al Web Service del backend y
completá `FRONTEND_URL` con su URL — así el backend solo acepta pedidos
desde ese dominio.

Nota: los planes gratuitos de Render "duermen" el backend tras un rato
sin uso, y tarda unos segundos en reactivarse con el primer pedido — es
normal, no es un error.
