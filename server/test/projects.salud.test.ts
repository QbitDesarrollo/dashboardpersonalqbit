import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { projectsRouter } from '../src/routes/projects.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTarea, llamar, type Usuario } from './helpers/api.js';
import { query, uuid } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };
let admin: Usuario;
let marcaId: string;
let proyectoId: string;

beforeAll(async () => { api = await levantarApp(projectsRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => {
  // Friday 9-oct-2026 at 20:00 in Ecuador: in UTC it is already Saturday the 10th.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-10T01:00:00Z'));
  await limpiarBase();
  admin = await crearUsuario('Admin', 'admin');
  marcaId = await crearMarca('Alba del Bosque');
  proyectoId = uuid();
  await query("INSERT INTO projects (id, brand_id, nombre, estado, lider_user_id) VALUES (?, ?, 'Bot', 'en_curso', ?)", [proyectoId, marcaId, admin.id]);
});
afterEach(() => { vi.useRealTimers(); });

async function tarea(fecha: string, estado = 'en_proceso') {
  const id = await crearTarea(marcaId, `Vence ${fecha}`, estado);
  await query('UPDATE tasks SET project_id = ?, fecha_entrega = ? WHERE id = ?', [proyectoId, fecha, id]);
}
const proyecto = async () => { const r = await llamar(`${api.url}/projects/${proyectoId}`, admin); if (!r.body.project) throw new Error(`${r.status} ${JSON.stringify(r.body)}`); return r.body.project; };

describe('proyectos · vencidas y salud con la fecha de Ecuador', () => {
  it('de noche en Ecuador, lo que vence hoy todavía no está vencido', async () => {
    await tarea('2026-10-09');
    await tarea('2026-10-08');
    await tarea('2026-10-08', 'revision_cliente');
    const p = await proyecto();
    expect(p.vencidas).toBe(1);
    expect(p.salud).toBe('rojo');
  });

  it('amarillo si algo vence entre hoy y tres días después, contados en Ecuador', async () => {
    await tarea('2026-10-12');
    expect((await proyecto()).salud).toBe('amarillo');
  });

  it('verde si lo más cercano vence después de esos tres días', async () => {
    await tarea('2026-10-13');
    expect((await proyecto()).salud).toBe('verde');
  });

  it('rojo si el proyecto sigue en curso y su fecha de cierre ya pasó', async () => {
    await query("UPDATE projects SET fecha_fin = '2026-10-08' WHERE id = ?", [proyectoId]);
    expect((await proyecto()).salud).toBe('rojo');
    await query("UPDATE projects SET fecha_fin = '2026-10-09' WHERE id = ?", [proyectoId]);
    expect((await proyecto()).salud).toBe('verde');
  });
});
