# Tiusdei — Memoria del proyecto para Claude

## Qué es esto
**Tiusdei** (así se llama, no "Tuesday") es la plataforma de gestión de proyectos y tareas de Qbit Digital, **construida por Fadel Ibañez**. Gestiona TODAS las marcas de la agencia: ~49 brands, 14 mesas (desks), ~66 usuarios, ~2,000+ tareas. Complementa a **Nebula** (nebulav2.qbit.ec, servidor 147.182.205.212), la plataforma de contenido con IA que hoy maneja pocos clientes pero tiene el cerebro (RAG) con los documentos/contratos del Drive de cada cliente.

## Reglas de trabajo con Fadel
- **Español con tuteo ecuatoriano** ("puedes", "mira") — JAMÁS voseo argentino ("podés", "mirá"). Aplica a UI, prompts y conversación.
- Decirle **Tiusdei**, nunca "Tuesday".
- Todo se ve **por empresa/marca** — jamás mezclar información de clientes distintos en una vista.
- Es PRODUCCIÓN real: cambios quirúrgicos, probar después de cada deploy.
- Al terminar un cambio: build + restart PM2 + verificación.

## Stack y estructura
- **Front**: React + TypeScript + Vite + Tailwind + shadcn/ui (raíz del repo, `src/`). Build a `dist/`.
- **Back**: `server/` — Express + MySQL (puerto **3003**). Socket.io tiempo real. Integraciones: Google Drive, Google Calendar, Gemini AI, WhatsApp (Baileys).
- **MCP server**: `mcp-server/` — expone `list_brands`, `list_desks`, `list_assignees`, `get_enums`, `create_task`, `create_tasks` (auth por `api_tokens`).
- **DB**: MySQL `tiusdei` — credenciales en `server/.env` (`DATABASE_URL`). Tablas clave: `brands`, `desks`, `tasks`, `users`, `sprints`, `time_entries`, `approvals`, `deliverable_types` (catálogo de tipos de entregable, sin precios), `deliverables` (por task), `incidencias`, `wa_*`, `gemini_*`.
- **PM2**: `tiusdei-api` y `tiusdei-mcp`. Dominio: **tiusdei.qbit.ec** (nginx). Mapa de puertos del server: `/var/www/PUERTOS-EN-USO.md`.
- Este servidor (QBIA, 24.144.84.250) aloja ~20 apps más de Qbit en `/var/www` — no tocar nada fuera de `/var/www/tiusdei` sin pedido explícito.

## 🎯 Misión activa: el CONVERTIDOR DE CONTENIDOS
Pedido de Juan José Vivas (6-jul-2026). **Lee el plan completo en [CONVERTIDOR-PLAN.md](./CONVERTIDOR-PLAN.md) antes de tocar código** — contiene el pedido textual de Juan, la arquitectura decidida (Convertidor en Tiusdei + IA de contratos en Nebula), el modelo de datos propuesto (tarifario, brand_entregables, canjes), las reglas de negocio, los 3 modelos de canje (recomendado: créditos mensuales) y el roadmap en 4 fases.

Resumen en una línea: los clientes piden más contenido de lo contratado y nadie lo contabiliza → el Convertidor calcula canjes según tarifario (ej. 1 reel = 3 posts), valida el saldo mensual de la marca y registra todo con nombre — para proteger la rentabilidad.

Pendientes de definición: el tarifario real (lo conversa Juan con **Iván**; mientras tanto usar los ejemplos: post $20, reel $60, post animado = 2 posts estáticos) y la confirmación del modelo de créditos.
