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
