import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { tickReportes } from '../src/reportes/programador.js';
import { pendientesDe } from '../src/reportes/repositorio.js';
import { ErrorRunner } from '../src/minutas/ia/runner.js';
import type { DepsReportes } from '../src/reportes/servicio.js';
import { limpiarBase, cerrarLimpieza, crearUsuario, crearMarca, crearTarea, type Usuario } from './helpers/api.js';
import { query, uuid } from '../src/db/mysql.js';
import type { EmailOptions } from '../src/services/email.js';

const dirPdf = fs.mkdtempSync(path.join(os.tmpdir(), 'reportes-prog-'));
const enviados: EmailOptions[] = [];
let falla = false;

const deps: DepsReportes = {
  runner: {
    async trabajo(tipo, entrada: any) {
      if (falla) throw new ErrorRunner('Codex no pudo completar el trabajo.');
      const ids = (entrada.tareas ?? []).map((t: any) => t.id);
      if (tipo === 'reporte-descripciones') return { tareas: ids.map((id: string) => ({ id, de_que_trata: 'el tema' })) };
      if (tipo === 'reporte-avances') return { tareas: ids.map((id: string) => ({ id, avance: 'Se avanzó.', decision: '', bloqueo: '' })) };
      return { resumen_ejecutivo: 'Semana tranquila.', logros: [], decisiones: [], riesgos: [], mensaje_correo: 'Todo en orden.' };
    },
  },
  correo: { async enviar(o) { enviados.push(o); return true; } },
  esperar: async () => {},
  dirPdf,
  frontendUrl: 'https://tiusdei.test',
};

let lider: Usuario;
let proyectoId: string;
const tick = (iso: string) => tickReportes(deps, new Date(iso));
const reportes = () => query<any[]>(
  "SELECT estado, intentos, DATE_FORMAT(periodo_desde, '%Y-%m-%d') AS desde, proximo_intento_en, notificado_en FROM proyecto_reportes WHERE project_id = ?",
  [proyectoId],
);

beforeAll(async () => { await limpiarBase(); });
afterAll(async () => { await cerrarLimpieza(); fs.rmSync(dirPdf, { recursive: true, force: true }); });
beforeEach(async () => {
  await limpiarBase();
  enviados.length = 0;
  falla = false;
  lider = await crearUsuario('Even Fierro', 'equipo');
  const marca = await crearMarca('Alba del Bosque');
  proyectoId = uuid();
  await query('INSERT INTO projects (id, brand_id, nombre, lider_user_id) VALUES (?, ?, ?, ?)', [proyectoId, marca, 'Bot Proyecta', lider.id]);
  await query("INSERT INTO proyecto_reportes_config (project_id, activo, dia_entrega, hora_entrega, anticipacion_horas) VALUES (?, 1, 1, '08:00', 3)", [proyectoId]);
  const t = await crearTarea(marca, 'Momento de ofrecer cita', 'en_proceso');
  await query("UPDATE tasks SET project_id = ?, created_at = '2026-09-01 12:00:00' WHERE id = ?", [proyectoId, t]);
});

describe('tickReportes', () => {
  it('genera de madrugada y avisa al líder a la hora de entrega, una sola vez', async () => {
    await tick('2026-09-28T09:00:00Z');
    expect(await reportes()).toEqual([]);

    await tick('2026-09-28T10:30:00Z');
    expect(await reportes()).toMatchObject([{ estado: 'borrador', desde: '2026-09-21', notificado_en: null }]);
    await tick('2026-09-28T12:59:00Z');
    expect(enviados).toEqual([]);
    expect(await pendientesDe(lider.id)).toBe(0);

    await tick('2026-09-28T13:00:00Z');
    expect(enviados.map((e) => e.subject)).toEqual(['[Reporte listo] Bot Proyecta · 21 sep – 27 sep 2026']);
    // The button opens that project and that report.
    expect(enviados[0].html).toContain(`https://tiusdei.test/proyectos?proyecto=${proyectoId}`);
    expect(enviados[0].html).toMatch(/reporte=[0-9a-f-]{36}/);
    expect(await pendientesDe(lider.id)).toBe(1);
    const [aviso] = await query<any[]>('SELECT mensaje FROM notifications WHERE user_id = ?', [lider.id]);
    expect(aviso.mensaje).toBe('Tu reporte semanal de Bot Proyecta está listo para revisar.');

    await tick('2026-09-28T13:05:00Z');
    expect(enviados).toHaveLength(1);
    expect(await reportes()).toHaveLength(1);
  });

  it('si falla reintenta a los 10 y a los 30 minutos; al tercer fallo avisa al líder', async () => {
    falla = true;
    await tick('2026-09-28T10:30:00Z');
    expect(await reportes()).toMatchObject([{ estado: 'programado', intentos: 1 }]);
    await tick('2026-09-28T10:35:00Z');
    expect(await reportes()).toMatchObject([{ intentos: 1 }]);
    await tick('2026-09-28T10:41:00Z');
    expect(await reportes()).toMatchObject([{ estado: 'programado', intentos: 2 }]);
    await tick('2026-09-28T11:12:00Z');
    expect(await reportes()).toMatchObject([{ estado: 'fallido', intentos: 3 }]);
    expect(enviados.map((e) => e.subject)).toEqual(['[Reporte con problemas] Bot Proyecta · 21 sep – 27 sep 2026']);
  });

  it('un reporte que quedó a medias por un reinicio vuelve a la cola', async () => {
    await query(
      "INSERT INTO proyecto_reportes (id, project_id, periodo_desde, periodo_hasta, entregar_en, estado, generando_desde) VALUES (?, ?, '2026-09-21', '2026-09-27', '2026-09-28 13:00:00', 'generando', '2026-09-28 10:00:00')",
      [uuid(), proyectoId],
    );
    await tick('2026-09-28T10:45:00Z');
    expect(await reportes()).toMatchObject([{ estado: 'programado', intentos: 1 }]);
  });

  it('con los reportes desactivados no hace nada', async () => {
    await query('UPDATE proyecto_reportes_config SET activo = 0 WHERE project_id = ?', [proyectoId]);
    await tick('2026-09-28T10:30:00Z');
    expect(await reportes()).toEqual([]);
  });
});
