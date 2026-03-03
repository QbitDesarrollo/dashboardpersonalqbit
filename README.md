# Tiusdei

**Plataforma de gestión de proyectos y tareas** desarrollada por **Fadel Ibañez** / Qbit Digital.

## Stack tecnológico

- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Express.js + MySQL
- **Tiempo real:** Socket.io
- **Integraciones:** Google Drive, Google Calendar, Gemini AI

## Instalación

```sh
# Clonar el repositorio
git clone <URL_DEL_REPO>

# Instalar dependencias del frontend
npm install

# Instalar dependencias del backend
cd server && npm install

# Configurar variables de entorno
cp .env.example .env

# Iniciar en desarrollo
npm run dev
```

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Build de producción |
| `npm run build:dev` | Build en modo desarrollo |
| `npm run lint` | Ejecutar ESLint |
| `npm run test` | Ejecutar tests |
