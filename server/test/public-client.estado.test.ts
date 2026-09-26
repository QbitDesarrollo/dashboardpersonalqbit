import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { publicClientRouter } from '../src/routes/public-client.js';
import { levantarAppEn, limpiarBase, cerrarLimpieza, crearMarca, crearTarea, llamar } from './helpers/api.js';
import { query, uuid } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };
let taskId: string;
const TOKEN = 'cb_prueba_estado';

beforeAll(async () => { api = await levantarAppEn('/api', publicClientRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  await limpiarBase();
  const marca = await crearMarca('Alba del Bosque');
  const board = uuid();
  await query('INSERT INTO client_boards (id, brand_id, token, activo) VALUES (?, ?, ?, 1)', [board, marca, TOKEN]);
  taskId = await crearTarea(marca, 'Piezas de lanzamiento', 'revision_cliente');
  await query('UPDATE tasks SET client_board_id = ?, cliente_visible = 1 WHERE id = ?', [board, taskId]);
});

describe('el cliente cambia el estado desde su tablero', () => {
  it('queda en el historial de la tarea, como cualquier otro cambio de estado', async () => {
    const r = await llamar(`${api.url}/public/client/${TOKEN}/tasks/${taskId}/status`, null, 'PATCH', { estado: 'aprobado', autor_nombre: 'María' });
    expect(r.status).toBe(200);
    const log = await query<any[]>("SELECT action, old_value, new_value FROM activity_log WHERE entity_id = ? AND field_name = 'estado'", [taskId]);
    expect(log).toEqual([{ action: 'status_change', old_value: 'revision_cliente', new_value: 'aprobado' }]);
  });
});
