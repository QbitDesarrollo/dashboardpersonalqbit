# TIUSDEI - Configuración MySQL

El proyecto ya no usa Supabase. Todo corre contra MySQL en tu servidor.

## 1. Crear base de datos y tablas

Configura `server/.env` con tu MySQL:

```bash
# En server/.env
DATABASE_URL=mysql://root:TU_PASSWORD_MYSQL@localhost:3306/tiusdei
JWT_SECRET=una_clave_secreta_larga_para_jwt
```

Luego ejecuta (desde `/var/www/tiusdei/server`):

```bash
# Crear BD y ejecutar schema (usa DATABASE_URL de .env)
DATABASE_URL=mysql://root:TU_PASSWORD@localhost:3306 npx tsx scripts/setup-db.ts
```

Asegúrate de que después `DATABASE_URL` en `.env` incluya `/tiusdei`:

```
DATABASE_URL=mysql://root:TU_PASSWORD@localhost:3306/tiusdei
```

## 2. Crear usuario admin

```bash
cd /var/www/tiusdei/server
npx tsx scripts/create-admin.ts admin@tiusdei.qbit.ec TuPasswordSegura
```

## 3. Reiniciar API

```bash
pm2 restart tiusdei-api
```

## 4. Iniciar sesión

- URL: https://tiusdei.qbit.ec
- Email y contraseña los que usaste en el paso 2.

## Archivos / APIs

- **Auth:** `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`
- **Datos:** `GET/POST/PATCH /api/data/profiles`, `/clients`, `/brands`, `/desks`, `/tasks`, `/deliverables`, `/files`, etc.
- **Health:** `GET /api/health` (comprueba MySQL en lugar de Supabase)

## Archivos adjuntos

No hay storage tipo Supabase. Los “archivos” se guardan como **URL**: nombre + enlace (Google Drive, Dropbox, etc.). En “Archivos” y en adjuntos de tareas se usa “Agregar archivo (URL)”.
