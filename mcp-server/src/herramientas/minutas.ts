import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/** Calls the Tiusdei API with the current user's token (see callTiusdei in index.ts). */
export type LlamarTiusdei = (path: string, init?: RequestInit) => Promise<unknown>;

const json = (data: unknown) => ({ type: "text" as const, text: JSON.stringify(data) });

/**
 * Minutas tools. A minuta hangs from a brand (optional project) and holds numbered points (1.1, 1.2…)
 * with a responsible (team member or the client), a due date, evidence and linked tasks.
 */
export function registrarMinutas(server: McpServer, llamar: LlamarTiusdei): void {
  server.registerTool(
    "list_minutas",
    {
      description:
        "List Tiusdei meeting minutes (minutas), newest first. Each row: id, code (M-01…), brand, project, title, date, status (Borrador/Publicada), owner, progress and url. All filters optional; resolve brandId with list_brands. `query` searches the minuta title and its points' titles and descriptions. For the full content of one minuta call get_minuta.",
      inputSchema: {
        brandId: z.string().optional().describe("Brand id from list_brands"),
        projectId: z.string().optional().describe("Project id"),
        query: z.string().optional().describe("Free text over titles and point descriptions"),
      },
    },
    async (input) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(input)) if (v) qs.set(k, String(v));
      const data = await llamar(`/minutas${qs.toString() ? `?${qs}` : ""}`);
      return { content: [json(data)] };
    },
  );

  server.registerTool(
    "get_minuta",
    {
      description:
        "Get ONE minuta in full: summary/agreements, owner, members and every point with code (e.g. 1.3), title, description, status, assignee ('Cliente' when the client owes it), due date, whether the client can see it, what was done, evidence (links, Google Drive files, screenshots), linked tasks and client notes. Dates are YYYY-MM-DD; times (closedAt, notes) are already in Ecuador time (America/Guayaquil). Screenshots uploaded to Tiusdei are attached as images (up to 6) so you can look at them; Drive files are only links. Set includeImages=false to skip them.",
      inputSchema: {
        minutaId: z.string().describe("Minuta id from list_minutas"),
        includeImages: z.boolean().optional().describe("Attach evidence screenshots (default true)"),
      },
    },
    async ({ minutaId, includeImages }) => {
      const id = encodeURIComponent(minutaId);
      const minuta = await llamar(`/minutas/${id}`);
      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [json(minuta)];
      if (includeImages !== false) {
        const { images, omitted } = (await llamar(`/minutas/${id}/images`)) as {
          images: { point: string; name: string; mimeType: string; data: string }[];
          omitted?: number;
        };
        for (const img of images) {
          content.push({ type: "text", text: `Evidencia del punto ${img.point}: ${img.name}` });
          content.push({ type: "image", data: img.data, mimeType: img.mimeType });
        }
        if (omitted) content.push({ type: "text", text: `${omitted} imagen(es) no se adjuntaron (límite o tamaño); están en la url de la evidencia.` });
      }
      return { content };
    },
  );

  server.registerTool(
    "create_minuta",
    {
      description:
        "Create a minuta in Tiusdei. WRITE operation. The current user becomes its owner and it is numbered per brand (M-01, M-02…). Each point needs a title; set `client: true` when the CLIENT must do or send it, otherwise optionally set `assigneeId` (a person id from list_assignees). `date` defaults to today in Ecuador. It is saved as a draft (Borrador) unless publish=true. Returns { id, code, url, points: [{ id, code, title }] } — use a point id with link_task_to_minuta_point.",
      inputSchema: {
        brandId: z.string().describe("Brand id from list_brands"),
        projectId: z.string().optional().describe("Project id of that same brand"),
        date: z.string().optional().describe("Meeting date YYYY-MM-DD (default: today in Ecuador)"),
        title: z.string().describe("Main topic in a few words, e.g. 'Revisión de avance: home y catálogo'"),
        summary: z.string().optional().describe("Context and general agreements (things that need no work go here, not as points)"),
        publish: z.boolean().optional().describe("true to publish; default draft"),
        points: z
          .array(
            z.object({
              title: z.string(),
              description: z.string().optional(),
              assigneeId: z.string().optional().describe("Team member id from list_assignees"),
              client: z.boolean().optional().describe("true when the client owes this point"),
              dueDate: z.string().optional().describe("Commitment date YYYY-MM-DD"),
            }),
          )
          .optional()
          .describe("Points in order; they become 1.1, 1.2…"),
      },
    },
    async (input) => {
      const created = await llamar("/minutas", { method: "POST", body: JSON.stringify(input) });
      return { content: [json({ ok: true, ...(created as object) })] };
    },
  );

  server.registerTool(
    "add_minuta_points",
    {
      description:
        "Add points to an EXISTING minuta. WRITE operation. They are appended after the last point (if it has 1.1 and 1.2, the new ones become 1.3, 1.4…). Same point fields as create_minuta: a title, optional description, `client: true` when the CLIENT must do or send it, otherwise optionally `assigneeId` (a person id from list_assignees), and an optional due date. Returns { id, code, url, points: [{ id, code, title }] } with only the new points — use a point id with link_task_to_minuta_point.",
      inputSchema: {
        minutaId: z.string().describe("Minuta id from list_minutas"),
        points: z
          .array(
            z.object({
              title: z.string(),
              description: z.string().optional(),
              assigneeId: z.string().optional().describe("Team member id from list_assignees"),
              client: z.boolean().optional().describe("true when the client owes this point"),
              dueDate: z.string().optional().describe("Commitment date YYYY-MM-DD"),
            }),
          )
          .min(1)
          .describe("Points to add, in order"),
      },
    },
    async ({ minutaId, points }) => {
      const added = await llamar(`/minutas/${encodeURIComponent(minutaId)}/points`, { method: "POST", body: JSON.stringify({ points }) });
      return { content: [json({ ok: true, ...(added as object) })] };
    },
  );

  const permisos = " Internal team only (admin, ejecutivo, equipo), same permissions as the web. Errors propagate as TIUSDEI_FORBIDDEN, TIUSDEI_VALIDATION, TIUSDEI_NOT_FOUND or TIUSDEI_INVALID_STATE.";
  const flujo = " Recommended flow: first upload_minuta_evidence for each file, then close_minuta_point with the evidenceIds, links and Drive ids.";
  server.registerTool(
    "upload_minuta_evidence",
    {
      description: "Upload evidence for a minuta point. WRITE operation. Accepts raw base64 (no data URL), at most 10 MB decoded, PNG/JPEG/WEBP/PDF only; the server checks magic bytes against MIME. Optional pointId attaches immediately; otherwise keep evidenceId for closing later. Returns { evidenceId, url, type, name, pointId }; PDF type is archivo. Errors: TIUSDEI_FILE_TOO_LARGE, TIUSDEI_UNSUPPORTED_FILE." + flujo + permisos,
      inputSchema: {
        fileBase64: z.string().min(1).describe("Raw base64 file content"),
        fileName: z.string().trim().min(1).max(500).describe("Original display name, e.g. Entrega.pdf"),
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
        pointId: z.string().uuid().optional().describe("Attach now to this point; omit to attach on close"),
      },
    },
    async (input) => ({ content: [json(await llamar("/minuta-evidence", { method: "POST", body: JSON.stringify(input) }))] }),
  );
  server.registerTool(
    "close_minuta_point",
    {
      description: "Close a minuta point with what was delivered and its evidence. WRITE operation, atomic: invalid input leaves the point/evidence/activity unchanged. Team points require whatWasDone >=10 trimmed characters; client points may have an empty note, but must provide whatWasDone. Every point requires >=1 evidence (already attached evidence counts), otherwise TIUSDEI_EVIDENCE_REQUIRED. Only pending/in-progress points can close. Records the token owner, Ecuador-time closedAt and 'Cerrado vía MCP'. Returns the updated point in get_minuta format; evidence remains {type,name,url}. An evidenceId belonging to another point is TIUSDEI_VALIDATION. Pending evidenceIds may only be attached by the same token owner who uploaded them; another owner or a concurrent claim returns TIUSDEI_VALIDATION. MCP activity notes remain internal and are not shared with clients." + flujo + permisos,
      inputSchema: {
        pointId: z.string().uuid(),
        whatWasDone: z.string().max(10000).describe("What was done; >=10 characters for team points"),
        evidence: z.array(z.union([
          z.object({ evidenceId: z.string().uuid() }).strict(),
          z.object({ url: z.string().url(), name: z.string().trim().min(1).max(500).optional() }).strict(),
          z.object({ driveFileId: z.string().min(1).max(255), name: z.string().trim().min(1).max(500).optional(), url: z.string().url().optional() }).strict(),
        ])).max(100).optional().describe("Uploaded evidenceIds, HTTP(S) links or Drive ids; omit if evidence is already attached"),
      },
    },
    async ({ pointId, ...body }) => ({ content: [json(await llamar(`/minuta-points/${encodeURIComponent(pointId)}/close`, { method: "POST", body: JSON.stringify(body) }))] }),
  );
  server.registerTool(
    "reopen_minuta_point",
    {
      description: "Reopen a completed minuta point when more work is needed. WRITE operation. Requires a reason >=3 trimmed characters. Completed -> in progress; clears closedBy/closedAt, preserves whatWasDone and evidence, and records 'Reabierto vía MCP: <reason>'. Any other state returns TIUSDEI_INVALID_STATE. Returns the updated point in get_minuta format." + permisos,
      inputSchema: { pointId: z.string().uuid(), reason: z.string().trim().min(3).max(2000) },
    },
    async ({ pointId, reason }) => ({ content: [json(await llamar(`/minuta-points/${encodeURIComponent(pointId)}/reopen`, { method: "POST", body: JSON.stringify({ reason }) }))] }),
  );
  server.registerTool(
    "delete_minuta_evidence",
    {
      description: "Remove one evidence from a minuta point, e.g. an old version replaced by a newer file. WRITE operation, atomic. Identify it by its exact name or url as returned by get_minuta (evidence[].name / evidence[].url); if several share the name, pass the url. Same rule as the web: a closed point (Completado/Aprobado) must keep at least one evidence, otherwise TIUSDEI_EVIDENCE_REQUIRED, so upload and attach the new evidence first. Does not reopen the point or change whatWasDone. Unknown name/url returns TIUSDEI_NOT_FOUND; ambiguous name returns TIUSDEI_VALIDATION. Returns the updated point in get_minuta format." + permisos,
      inputSchema: {
        pointId: z.string().uuid(),
        name: z.string().trim().min(1).max(500).optional().describe("Exact evidence name from get_minuta"),
        url: z.string().trim().min(1).max(1000).optional().describe("Exact evidence url from get_minuta"),
      },
    },
    async ({ pointId, ...body }) => ({ content: [json(await llamar(`/minuta-points/${encodeURIComponent(pointId)}/evidence`, { method: "DELETE", body: JSON.stringify(body) }))] }),
  );
  server.registerTool(
    "update_minuta_point",
    {
      description: "Edit a minuta point or move it within its minuta. WRITE operation, atomic. All fields except pointId optional. client:true clears assigneeId; setting assigneeId switches client off unless client:true is also given. Assignee must be an active internal user, otherwise TIUSDEI_INVALID_ASSIGNEE. position is 1-based, positive integer; beyond the last position moves to last. Renumbers all points 1..N without gaps. Returns the updated point in get_minuta format." + permisos,
      inputSchema: {
        pointId: z.string().uuid(), title: z.string().trim().min(1).max(300).optional(),
        description: z.string().max(10000).nullable().optional(), assigneeId: z.string().uuid().nullable().optional(),
        client: z.boolean().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        position: z.number().int().min(1).optional(),
      },
    },
    async ({ pointId, ...body }) => ({ content: [json(await llamar(`/minuta-points/${encodeURIComponent(pointId)}`, { method: "PATCH", body: JSON.stringify(body) }))] }),
  );

  server.registerTool(
    "link_task_to_minuta_point",
    {
      description:
        "Link an existing task to a minuta point (both must belong to the same brand). WRITE operation. To create a task FROM a point: first create_task with the minuta's brand (reuse the point's title/description/due date), then call this tool with the new task id and the point id from get_minuta/create_minuta.",
      inputSchema: {
        pointId: z.string().describe("Point id from get_minuta or create_minuta"),
        taskId: z.string().describe("Task id (from create_task or search_tasks)"),
      },
    },
    async ({ pointId, taskId }) => {
      const result = await llamar(`/minuta-points/${encodeURIComponent(pointId)}/tasks`, { method: "POST", body: JSON.stringify({ taskId }) });
      return { content: [json(result)] };
    },
  );
}
