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
- **MCP server**: `mcp-server/` — expone `list_brands`, `list_desks`, `list_assignees`, `list_departments`, `get_enums`, `create_task`, `create_tasks` (auth por `api_tokens`).
- **DB**: MySQL `tiusdei` — credenciales en `server/.env` (`DATABASE_URL`). Tablas clave: `brands`, `desks`, `tasks`, `users`, `sprints`, `time_entries`, `approvals`, `deliverable_types` (catálogo de tipos de entregable, sin precios), `deliverables` (por task), `incidencias`, `wa_*`, `gemini_*`.
- **PM2**: `tiusdei-api` y `tiusdei-mcp`. Dominio: **tiusdei.qbit.ec** (nginx). Mapa de puertos del server: `/var/www/PUERTOS-EN-USO.md`.
- Este servidor (QBIA, 24.144.84.250) aloja ~20 apps más de Qbit en `/var/www` — no tocar nada fuera de `/var/www/tiusdei` sin pedido explícito.

## Reglas de código: modular, no espagueti
`src/pages/Tasks.tsx` llegó a 3.400 líneas con el formulario, la lista, el detalle y los filtros mezclados. Para que no se repita:

- **Tamaño**: ningún archivo nuevo pasa de ~300 líneas. A un archivo que ya supera 500 (hoy: `Tasks.tsx`, `admin/Config.tsx`, `Dashboard.tsx`, `Scrum.tsx`, `EquipoMesa.tsx`) no se le agrega lógica nueva: primero se extrae la parte que se va a tocar.
- **Páginas componen**: `src/pages/` carga datos, maneja la navegación y arma componentes. Formularios, diálogos y listas viven en `src/components/<dominio>/`, un componente por archivo.
- **Lógica fuera de JSX**: reglas puras (validaciones, cálculos, armado de payloads) en `src/lib/`, sin React ni fetch, con tests unitarios. Estado de UI reutilizable en hooks `useAlgo.ts` junto al componente que lo usa.
- **Compartir, no copiar**: si un formulario o diálogo se necesita en otra pantalla, se importa el componente. Nada de pegamento por URL ni estado global para pasar datos entre pantallas. Ejemplo: `src/components/tasks/form/TaskFormDialog.tsx` crea/edita tareas en Tareas y en Minutas.
- **Backend por dominio**: rutas delgadas en `server/src/routes/`, validación zod en `esquemas.ts`, reglas puras en `domain.ts` (con tests), SQL en `consultas.ts`, permisos en `permisos.ts`. Ejemplo: `server/src/minutas/`.
- **Refactor seguro**: antes de mover código sin tests, se escriben tests de caracterización que fijen lo que hace hoy (ejemplo: `src/pages/Tasks.form.test.tsx`) y se comprueba que muerden rompiendo el código a propósito.
- **TDD**: test que falla → código mínimo → refactor. Front: `npx vitest run` (Vitest + Testing Library con `fireEvent`). Back: `cd server && npx vitest run` contra la base `tiusdei_test` (credenciales en `server/.env.test`, jamás la de producción).

## Minutas
Reuniones con el cliente → puntos → tareas → evidencia. Cuelgan de la marca (proyecto opcional). Front: `src/pages/Minuta*.tsx` y `src/components/minutas/`; modo presentación en `/minutas/:id/presentar` (solo puntos visibles; el cliente aprueba, pide ajustes o deja notas). Back: `server/src/minutas/` y `server/src/routes/minuta*.ts`. Migraciones 035–038. No hay enlace público: todo se ve dentro de Tiusdei.

## 🎯 Misión activa: el CONVERTIDOR DE CONTENIDOS
Pedido de Juan José Vivas (6-jul-2026). **Lee el plan completo en [CONVERTIDOR-PLAN.md](./CONVERTIDOR-PLAN.md) antes de tocar código** — contiene el pedido textual de Juan, la arquitectura decidida (Convertidor en Tiusdei + IA de contratos en Nebula), el modelo de datos propuesto (tarifario, brand_entregables, canjes), las reglas de negocio, los 3 modelos de canje (recomendado: créditos mensuales) y el roadmap en 4 fases.

Resumen en una línea: los clientes piden más contenido de lo contratado y nadie lo contabiliza → el Convertidor calcula canjes según tarifario (ej. 1 reel = 3 posts), valida el saldo mensual de la marca y registra todo con nombre — para proteger la rentabilidad.

Pendientes de definición: el tarifario real (lo conversa Juan con **Iván**; mientras tanto usar los ejemplos: post $20, reel $60, post animado = 2 posts estáticos) y la confirmación del modelo de créditos.
