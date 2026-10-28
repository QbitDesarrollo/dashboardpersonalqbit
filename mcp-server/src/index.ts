/**
 * Tiusdei MCP — servidor remoto (HTTP).
 *
 * Es un MCP REMOTO: un servidor HTTP (transporte Streamable HTTP) desplegado
 * en el VPS, junto a Tiusdei. Cada request trae el token del usuario en la
 * cabecera Authorization — no hay token fijo en el servidor.
 *
 * Los devs lo conectan desde Claude Code con:
 *   claude mcp add --transport http tiusdei https://tiusdei.qbit.ec/mcp \
 *     --header "Authorization: Bearer <token>"
 *
 * Configuración (variables de entorno, ver .env.example):
 *   PORT             Puerto donde escucha (default 3000). El endpoint es POST /mcp.
 *   TIUSDEI_API_URL  Base URL de la API de Tiusdei, ej. http://127.0.0.1:3003/api
 */

import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { registrarMinutas } from "./herramientas/minutas.js";

const PORT = Number(process.env.PORT ?? 3000);
const API_URL = process.env.TIUSDEI_API_URL;

/** Extrae el token por-usuario de la cabecera Authorization. */
function getToken(req: Request): string {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    // Error explícito y con nombre — nunca fallar en silencio.
    throw new Error("TIUSDEI_TOKEN_MISSING: falta la cabecera 'Authorization: Bearer <token>'.");
  }
  return token;
}

/**
 * Wrapper HTTP sobre la API de Tiusdei en el VPS.
 *
 * Cuando la API responde con error, el body trae { error: "TIUSDEI_*", message,
 * details? }. Propagamos ese nombre tal cual para que la skill pueda reaccionar
 * (ej. TIUSDEI_STALE_ASSIGNEE con el id ofensor).
 */
async function callTiusdei(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  if (!API_URL) {
    throw new Error("TIUSDEI_CONFIG_MISSING: define la variable de entorno TIUSDEI_API_URL.");
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let body: unknown = undefined;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  if (!res.ok) {
    // Surfacear el error CON NOMBRE que devuelve la API de Tiusdei.
    if (body && typeof body === "object" && "error" in body) {
      const e = body as { error: string; message?: string; details?: unknown };
      const detail = e.details ? ` ${JSON.stringify(e.details)}` : "";
      throw new Error(`${e.error}: ${e.message ?? "error de Tiusdei"}${detail}`);
    }
    const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
    throw new Error(`TIUSDEI_HTTP_${res.status}: ${text.slice(0, 200)}`);
  }

  return body;
}

/** Campos de una tarea — compartidos por create_task y create_tasks. */
const createTaskShape = {
  title: z.string(),
  brandId: z.string(),
  deskId: z.string(),
  assigneeIds: z.array(z.string()),
  department: z
    .string()
    .optional()
    .describe(
      "Production pipeline stage name — MUST be an exact name from list_departments (e.g. 'Desarrollo', 'QA'). Do NOT invent free text; if unsure, call list_departments first. Invalid names are rejected with TIUSDEI_INVALID_DEPARTMENT.",
    ),
  taskType: z.string(),
  deliverableType: z
    .string()
    .optional()
    .describe(
      "Deliverable type name — MUST be an exact name from get_enums.deliverableType (e.g. 'Post', 'Reel', 'Video'). Do NOT invent free text; if unsure, call get_enums first. Invalid names are rejected with TIUSDEI_INVALID_DELIVERABLE_TYPE. Tiusdei's task form treats this as required, so set it whenever the task represents a concrete deliverable.",
    ),
  deliverableQuantity: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("How many units of deliverableType this task covers. Defaults to 1. Ignored if deliverableType is not set."),
  priority: z.string(),
  status: z.string(),
  startDate: z.string().describe("Fecha en formato YYYY-MM-DD"),
  dueDate: z.string().describe("Fecha en formato YYYY-MM-DD"),
  detail: z.string(),
  links: z.array(z.string()).optional(),
  projectId: z
    .string()
    .optional()
    .describe("Optional. Project of the same brand (id from list_projects with this brandId). Omit when the task has no project."),
};

/** Construye un servidor MCP fresco ligado al token de un usuario. */
function buildServer(token: string): McpServer {
  const server = new McpServer({ name: "tiusdei-mcp", version: "1.0.0" });

  /** Projects (optional grouping of tasks inside a brand). */
  server.registerTool(
    "list_projects",
    {
      description:
        "List active Tiusdei projects visible to the current token: id, name, brand, status (En curso, Pausado, Terminado, Cancelado), leader, endDate, tasks and done. A project belongs to one brand and is OPTIONAL for a task: use it to set or filter projectId in create_task, create_tasks, update_task and search_tasks only when the task belongs to one. Filter by brandId to get the projects valid for a task of that brand.",
      inputSchema: {
        brandId: z.string().optional().describe("Solo proyectos de esta marca (id de list_brands)"),
        status: z.string().optional().describe("En curso | Pausado | Terminado | Cancelado"),
      },
    },
    async (input) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(input)) if (v) qs.set(k, String(v));
      const proyectos = await callTiusdei(token, `/projects${qs.toString() ? `?${qs}` : ""}`);
      return { content: [{ type: "text", text: JSON.stringify(proyectos) }] };
    },
  );

  /** Lista las marcas visibles para el token actual. Devuelve [{ id, name }]. */
  server.registerTool(
    "list_brands",
    {
      description: "List the Tiusdei brands visible to the current token.",
      inputSchema: {},
    },
    async () => {
      const brands = await callTiusdei(token, "/brands");
      return { content: [{ type: "text", text: JSON.stringify(brands) }] };
    },
  );

  /** Lista las mesas (desks) visibles para el token actual. Devuelve [{ id, name }]. */
  server.registerTool(
    "list_desks",
    {
      description: "List the Tiusdei desks (mesas) visible to the current token.",
      inputSchema: {},
    },
    async () => {
      const desks = await callTiusdei(token, "/desks");
      return { content: [{ type: "text", text: JSON.stringify(desks) }] };
    },
  );

  /** Lista los miembros (assignees) de una mesa. Devuelve [{ id, name }]. */
  server.registerTool(
    "list_assignees",
    {
      description: "List the team members (assignees) of a Tiusdei desk.",
      inputSchema: { deskId: z.string().describe("Desk id from list_desks") },
    },
    async ({ deskId }) => {
      const assignees = await callTiusdei(token, `/desks/${encodeURIComponent(deskId)}/assignees`);
      return { content: [{ type: "text", text: JSON.stringify(assignees) }] };
    },
  );

  /** Lista los departamentos (etapas de pipeline) disponibles. Devuelve [{ id, name }]. */
  server.registerTool(
    "list_departments",
    {
      description:
        "List the Tiusdei departments (production pipeline stages, e.g. Diseño, Desarrollo, QA) available for the `department` field of create_task/create_tasks.",
      inputSchema: {},
    },
    async () => {
      const departments = await callTiusdei(token, "/departments");
      return { content: [{ type: "text", text: JSON.stringify(departments) }] };
    },
  );

  /** Valores válidos para los campos seleccionables de Tiusdei. */
  server.registerTool(
    "get_enums",
    {
      description:
        "Return the valid values for Tiusdei's selectable enums: priority, status, taskType, deliverableType.",
      inputSchema: {},
    },
    async () => {
      const enums = await callTiusdei(token, "/enums");
      return { content: [{ type: "text", text: JSON.stringify(enums) }] };
    },
  );

  /**
   * Busca/lista tareas visibles para el token. Devuelve filas resumidas + cursor.
   * Es la herramienta de LECTURA principal: úsala antes de crear (para no duplicar)
   * y para responder "¿qué tengo pendiente?", "tareas vencidas de X", etc.
   */
  server.registerTool(
    "search_tasks",
    {
      description:
        "Search/list Tiusdei tasks visible to the current token. Returns SUMMARY rows (not full detail) plus pagination { total, has_more, next_cursor }. Use this BEFORE create_task to avoid duplicates, and to answer questions like 'what's pending', 'overdue tasks for brand X', 'my tasks in review'. All filters are optional and combine with AND. For a brand/desk/assignee filter, first resolve the id with list_brands/list_desks/list_assignees. For the full detail of one row, call get_task with its id. To page, pass the returned next_cursor back as `cursor` WITHOUT changing the other filters.",
      inputSchema: {
        query: z.string().optional().describe("Texto libre; busca en el título de la tarea"),
        brandId: z.string().optional().describe("Filtra por marca (id de list_brands)"),
        projectId: z.string().optional().describe("Filtra por proyecto (id de list_projects)"),
        deskId: z.string().optional().describe("Filtra por mesa (id de list_desks)"),
        assigneeId: z.string().optional().describe("Filtra por responsable (id de list_assignees)"),
        mine: z.boolean().optional().describe("Solo tareas donde el dueño del token es responsable"),
        status: z.string().optional().describe("Estado por label de get_enums, ej. 'En proceso'"),
        priority: z.string().optional().describe("Prioridad: 'Alta' | 'Media' | 'Baja'"),
        overdue: z.boolean().optional().describe("Solo vencidas y aún no entregadas/aprobadas"),
        dueFrom: z.string().optional().describe("fecha_entrega >= esta fecha (YYYY-MM-DD)"),
        dueTo: z.string().optional().describe("fecha_entrega <= esta fecha (YYYY-MM-DD)"),
        pageSize: z.number().int().min(1).max(25).optional().describe("Filas por página (default 10, máx 25)"),
        cursor: z.string().optional().describe("next_cursor de la llamada anterior; no cambies los otros filtros"),
      },
    },
    async (input) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(input)) {
        if (v === undefined || v === null || v === "") continue;
        qs.set(k, String(v));
      }
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const data = await callTiusdei(token, `/tasks${suffix}`);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  );

  /** Detalle completo de UNA tarea por id (de search_tasks). Sin comentarios/historial. */
  server.registerTool(
    "get_task",
    {
      description:
        "Get the full detail of ONE Tiusdei task by id (obtained from search_tasks). Returns title, detail, brand, project (or null), desk, status, priority, taskType, department, deliverableType, deliverableQuantity, assignees, dates, links and url. Does NOT include comments or activity history. Use it when the user picks a task from a search_tasks list.",
      inputSchema: { taskId: z.string().describe("Task id from search_tasks") },
    },
    async ({ taskId }) => {
      const task = await callTiusdei(token, `/tasks/${encodeURIComponent(taskId)}`);
      return { content: [{ type: "text", text: JSON.stringify(task) }] };
    },
  );

  /** Crea UNA Tarea en Tiusdei. Devuelve { id, url }. */
  server.registerTool(
    "create_task",
    {
      description:
        "Create a Task in Tiusdei. Returns the created task id and url. If `department` is set, it is validated against list_departments — an unrecognized name is rejected with TIUSDEI_INVALID_DEPARTMENT, it is never stored as free text. If `deliverableType` is set, it is validated against get_enums.deliverableType — an unrecognized name is rejected with TIUSDEI_INVALID_DELIVERABLE_TYPE.",
      inputSchema: createTaskShape,
    },
    async (input) => {
      // Las claves de `input` coinciden 1:1 con el body que espera POST /api/tasks.
      const created = await callTiusdei(token, "/tasks", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const result =
        created && typeof created === "object" ? created : { value: created };
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, ...result }) }],
      };
    },
  );

  /**
   * Crea VARIAS Tareas en una sola llamada. Best-effort: una tarea que falle no
   * bloquea a las demás. Devuelve un resultado POR CADA tarea, en el mismo orden
   * del array de entrada: { results: [{ ok, id, url } | { ok:false, error, message }], created, failed }.
   * Úsala en vez de llamar create_task en bucle cuando hay que publicar una lista.
   */
  server.registerTool(
    "create_tasks",
    {
      description:
        "Create multiple Tasks in Tiusdei in a single call. Best-effort: a failing task does not block the others. Returns one result per task, in input order: { results: [{ ok:true, id, url } | { ok:false, error, message }], created, failed }. Prefer this over calling create_task in a loop. Each task's `department` and `deliverableType` (if set) are validated the same way as create_task.",
      inputSchema: {
        tasks: z
          .array(z.object(createTaskShape))
          .describe("Lista de tareas a crear. Cada objeto tiene exactamente los mismos campos que create_task."),
      },
    },
    async ({ tasks }) => {
      const result = await callTiusdei(token, "/tasks/bulk", {
        method: "POST",
        body: JSON.stringify({ tasks }),
      });
      // La API ya devuelve { results, created, failed }; lo pasamos tal cual.
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  /** Cambia el ESTADO de una tarea. Escritura. */
  server.registerTool(
    "change_task_status",
    {
      description:
        "Change the status of a Tiusdei task. WRITE operation. `status` must be a valid label from get_enums (e.g. 'En proceso', 'Entregado'). Look up the task first with search_tasks/get_task. Notifies the task author and followers; if a recurring task is set to 'Entregado', its next instance is created automatically.",
      inputSchema: {
        taskId: z.string().describe("Task id (from search_tasks/get_task)"),
        status: z.string().describe("Nuevo estado, label de get_enums"),
      },
    },
    async ({ taskId, status }) => {
      const result = await callTiusdei(token, `/tasks/${encodeURIComponent(taskId)}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  /** REEMPLAZA los responsables de una tarea. Escritura. */
  server.registerTool(
    "assign_task",
    {
      description:
        "Set (REPLACE) the assignees of a Tiusdei task. WRITE operation. `assigneeIds` is the FULL new set — it replaces the current assignees, it does not add to them. The first id becomes the primary responsible. Resolve ids with list_assignees. New assignees get an in-app notification and Google Calendar sync. Pass an empty array to leave the task unassigned.",
      inputSchema: {
        taskId: z.string().describe("Task id (from search_tasks/get_task)"),
        assigneeIds: z.array(z.string()).describe("Conjunto COMPLETO de responsables (ids de list_assignees). Reemplaza los actuales."),
      },
    },
    async ({ taskId, assigneeIds }) => {
      const result = await callTiusdei(token, `/tasks/${encodeURIComponent(taskId)}/assignees`, {
        method: "PUT",
        body: JSON.stringify({ assigneeIds }),
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  /** Edita campos de fondo de una tarea. Escritura. */
  server.registerTool(
    "update_task",
    {
      description:
        "Update fields of a Tiusdei task. WRITE operation. All fields are optional; only the provided ones change. `priority` and `taskType` use labels/names from get_enums. `department` and `deliverableType` are validated the same way as create_task (TIUSDEI_INVALID_DEPARTMENT / TIUSDEI_INVALID_DELIVERABLE_TYPE) — pass null to clear either one. Dates are YYYY-MM-DD. IMPORTANT: changing `dueDate` REQUIRES `rescheduleReason` (one of INTERNO, CLIENTE, ALCANCE, FUERZA_MAYOR, SIN_CLASIFICAR) — it is recorded in the reschedule history. To change status use change_task_status; to change assignees use assign_task.",
      inputSchema: {
        taskId: z.string().describe("Task id (from search_tasks/get_task)"),
        title: z.string().optional().describe("Nuevo título"),
        detail: z.string().optional().describe("Nuevo detalle/descripción"),
        priority: z.string().optional().describe("Prioridad: 'Alta' | 'Media' | 'Baja'"),
        taskType: z.string().optional().describe("Tipo de tarea (nombre de get_enums)"),
        department: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Production pipeline stage name — exact name from list_departments. Pass null to clear. Invalid names are rejected with TIUSDEI_INVALID_DEPARTMENT.",
          ),
        deliverableType: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Deliverable type name — exact name from get_enums.deliverableType. Pass null to clear. Invalid names are rejected with TIUSDEI_INVALID_DELIVERABLE_TYPE.",
          ),
        deliverableQuantity: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("How many units of deliverableType. Defaults to 1. Ignored if deliverableType is not set in this same call."),
        links: z.array(z.string()).optional().describe("Reemplaza la lista de enlaces"),
        projectId: z
          .string()
          .nullable()
          .optional()
          .describe("Move the task to another project of its brand (id from list_projects), or null to take it out of its project."),
        startDate: z.string().optional().describe("Fecha de inicio YYYY-MM-DD"),
        dueDate: z.string().optional().describe("Fecha de entrega YYYY-MM-DD (exige rescheduleReason si cambia)"),
        rescheduleReason: z.string().optional().describe("Motivo del cambio de fecha de entrega: INTERNO|CLIENTE|ALCANCE|FUERZA_MAYOR|SIN_CLASIFICAR"),
      },
    },
    async (input) => {
      const { taskId, ...rest } = input;
      const result = await callTiusdei(token, `/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        body: JSON.stringify(rest),
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  /** Lista los comentarios de una tarea. */
  server.registerTool(
    "list_task_comments",
    {
      description:
        "List the comments of a Tiusdei task, most recent ones returned in chronological order. Use it to answer 'what has been said on this task?'. Get the taskId from search_tasks/get_task.",
      inputSchema: {
        taskId: z.string().describe("Task id (from search_tasks/get_task)"),
        limit: z.number().int().min(1).max(100).optional().describe("Máximo de comentarios (default 30, máx 100)"),
      },
    },
    async ({ taskId, limit }) => {
      const qs = limit ? `?limit=${limit}` : "";
      const data = await callTiusdei(token, `/tasks/${encodeURIComponent(taskId)}/comments${qs}`);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  );

  /** Agrega un comentario a una tarea. Escritura. */
  server.registerTool(
    "add_task_comment",
    {
      description:
        "Add a comment to a Tiusdei task. WRITE operation. Plain text; you can @mention a person by name (e.g. '@Carlos Pérez revisa esto') and they get notified. Task followers are also notified. Get the taskId from search_tasks/get_task.",
      inputSchema: {
        taskId: z.string().describe("Task id (from search_tasks/get_task)"),
        comment: z.string().describe("Texto del comentario (soporta @menciones por nombre)"),
      },
    },
    async ({ taskId, comment }) => {
      const result = await callTiusdei(token, `/tasks/${encodeURIComponent(taskId)}/comments`, {
        method: "POST",
        body: JSON.stringify({ comment }),
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  /** Historial de cambios de una tarea (sin comentarios ni ruido de timer). */
  server.registerTool(
    "get_task_activity",
    {
      description:
        "Get the change history of a Tiusdei task: status changes, assignments, field edits, handoffs and creation. Most recent first. Does NOT include comments (use list_task_comments) nor timer noise. Use it to answer 'what happened with this task?'. Get the taskId from search_tasks/get_task.",
      inputSchema: {
        taskId: z.string().describe("Task id (from search_tasks/get_task)"),
        limit: z.number().int().min(1).max(100).optional().describe("Máximo de entradas (default 30, máx 100)"),
      },
    },
    async ({ taskId, limit }) => {
      const qs = limit ? `?limit=${limit}` : "";
      const data = await callTiusdei(token, `/tasks/${encodeURIComponent(taskId)}/activity${qs}`);
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  );

  /** Borra una tarea. DESTRUCTIVO, con confirmación en dos pasos. */
  server.registerTool(
    "delete_task",
    {
      description:
        "Delete a Tiusdei task. DESTRUCTIVE and IRREVERSIBLE. TWO-STEP flow: (1) call delete_task with ONLY the taskId — the server returns { needsConfirmation:true, task:{...}, confirmToken } and does NOT delete. You MUST show that task to the user and get EXPLICIT confirmation. (2) Only after the user confirms, call delete_task again with the SAME taskId AND the confirmToken to actually delete. The confirmToken expires in ~5 minutes and is bound to that exact task and user. Never fabricate a confirmToken; never skip step 1. One task at a time.",
      inputSchema: {
        taskId: z.string().describe("Task id (from search_tasks/get_task)"),
        confirmToken: z.string().optional().describe("SOLO en el paso 2: el token devuelto por el preview, después de que el usuario confirmó. No lo inventes."),
      },
      annotations: {
        title: "Delete task (requires confirmation)",
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ taskId, confirmToken }) => {
      const body: Record<string, unknown> = {};
      if (confirmToken) body.confirmToken = confirmToken;
      const result = await callTiusdei(token, `/tasks/${encodeURIComponent(taskId)}/delete`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  /** Arranca el timer en una tarea. Escritura. */
  server.registerTool(
    "start_timer",
    {
      description:
        "Start the work timer on a Tiusdei task for the current user. WRITE operation. Only ONE timer can run at a time: if another is already running, the server returns TIUSDEI_TIMER_ACTIVE with the active task — ask the user if they want to switch (stop_timer, then start_timer). If the task was in backlog, starting the timer moves it to 'En proceso' automatically. Get the taskId from search_tasks/get_task.",
      inputSchema: { taskId: z.string().describe("Task id (from search_tasks/get_task)") },
    },
    async ({ taskId }) => {
      const result = await callTiusdei(token, `/tasks/${encodeURIComponent(taskId)}/timer/start`, { method: "POST", body: "{}" });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  /** Para el timer activo del usuario (solo hay uno). Escritura. */
  server.registerTool(
    "stop_timer",
    {
      description:
        "Stop the current user's active work timer (there is only one at a time — no taskId needed). WRITE operation. The elapsed time is added to the task's total. If no timer was running, it returns wasRunning:false (not an error).",
      inputSchema: {},
    },
    async () => {
      const result = await callTiusdei(token, `/timer/stop`, { method: "POST", body: "{}" });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  /** Qué tarea está cronometrando el usuario ahora. */
  server.registerTool(
    "get_active_timer",
    {
      description:
        "Return the task the current user is currently timing, and for how long (or null if no timer is running). Use it to answer 'what am I timing?' or before starting a new timer.",
      inputSchema: {},
    },
    async () => {
      const result = await callTiusdei(token, `/timer/active`);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  registrarMinutas(server, (path, init) => callTiusdei(token, path, init));

  return server;
}

const app = express();
// upload_minuta_evidence manda el archivo en base64: 10 MB de archivo son ~13,4 MB de JSON.
app.use(express.json({ limit: "16mb" }));
app.use((err: Error & { type?: string }, _req: Request, res: Response, next: NextFunction) => {
  if (err?.type !== "entity.too.large") return next(err);
  res.status(413).json({ error: "TIUSDEI_FILE_TOO_LARGE", message: "El archivo pesa más de 10 MB." });
});

// Streamable HTTP sin estado: un server + transporte fresco por request.
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const token = getToken(req);
    const server = buildServer(token);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  // Log a stderr para no interferir con el tráfico del protocolo.
  console.error(`Tiusdei MCP escuchando en :${PORT}/mcp`);
});
