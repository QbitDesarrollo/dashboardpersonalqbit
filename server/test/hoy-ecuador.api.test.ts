import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mcpRouter } from '../src/routes/mcp.js';
import { clientBoardsRouter } from '../src/routes/client-boards.js';
import { publicClientRouter } from '../src/routes/public-client.js';
import { dashboardsRouter } from '../src/routes/dashboards.js';
import { levantarApp, levantarAppEn, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTarea, crearTokenApi, llamar, type Usuario } from './helpers/api.js';
import { query, uuid } from '../src/db/mysql.js';

/** Every "overdue" and "due soon" count uses today's date in Ecuador, never the UTC date of the server or MySQL. */

let data: { url: string; cerrar: () => Promise<void> };
let publica: { url: string; cerrar: () => Promise<void> };
let admin: Usuario;
let marca: string;
let hoy: string;
let ayer: string;
const TOKEN = 'cb_prueba_hoy';

beforeAll(async () => {
  data = await levantarApp(clientBoardsRouter, dashboardsRouter);
  publica = await levantarAppEn('/api', publicClientRouter, mcpRouter);
});
afterAll(async () => { await data.cerrar(); await publica.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  // Friday 9-oct-2026 at 20:00 in Ecuador: in UTC it is already Saturday the 10th.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-10T01:00:00Z'));
  await limpiarBase();
  admin = await crearUsuario('Even Fierro', 'admin');
  marca = await crearMarca('Alba del Bosque');
  const board = uuid();
  const proyecto = uuid();
  await query('INSERT INTO client_boards (id, brand_id, token, activo) VALUES (?, ?, ?, 1)', [board, marca, TOKEN]);
  await query("INSERT INTO projects (id, brand_id, nombre, estado, lider_user_id, activo) VALUES (?, ?, 'Bot', 'en_curso', ?, 1)", [proyecto, marca, admin.id]);
  const tarea = async (titulo: string, fecha: string) => {
    const id = await crearTarea(marca, titulo, 'en_proceso');
    await query('UPDATE tasks SET fecha_entrega = ?, fecha_cliente = ?, client_board_id = ?, cliente_visible = 1, project_id = ? WHERE id = ?', [fecha, fecha, board, proyecto, id]);
    return id;
  };
  hoy = await tarea('Vence hoy', '2026-10-09');
  ayer = await tarea('Venció ayer', '2026-10-08');
});
afterEach(() => { vi.useRealTimers(); });

describe('hoy en Ecuador', () => {
  it('el filtro de vencidas del MCP solo trae lo de días anteriores', async () => {
    const mcp = await crearTokenApi(admin);
    const r = await llamar(`${publica.url}/tasks?overdue=true`, mcp);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain(ayer);
    expect(JSON.stringify(r.body)).not.toContain(hoy);
  });

  it('la lista de tableros del cliente cuenta como vencida solo la de ayer', async () => {
    const r = await llamar(`${data.url}/client-boards`, admin);
    expect(r.body[0]).toMatchObject({ vencidas: 1 });
  });

  it('en el tablero público, un proyecto con una tarea vencida ayer sale en rojo', async () => {
    const r = await llamar(`${publica.url}/public/client/${TOKEN}`, null);
    expect(r.body.projects[0]).toMatchObject({ salud: 'rojo' });
  });

  it('las tareas de la semana en el dashboard empiezan hoy', async () => {
    const r = await llamar(`${data.url}/dashboards/widget-data/tasks_due_this_week`, admin);
    expect(r.body.map((t: { titulo_tarea: string }) => t.titulo_tarea)).toEqual(['Vence hoy']);
  });
});
