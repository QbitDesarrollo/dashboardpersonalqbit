import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { configRouter } from '../src/routes/config.js';
import { levantarAppEn, limpiarBase, cerrarLimpieza, crearUsuario, llamar } from './helpers/api.js';
import { query } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };

beforeAll(async () => { api = await levantarAppEn('/api/config', configRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => { await limpiarBase(); });

describe('PATCH /site-settings · minutas con IA', () => {
  it('guarda las mesas que pueden usar la IA y el límite diario', async () => {
    const admin = await crearUsuario('Admin', 'admin');
    const r = await llamar(`${api.url}/site-settings`, admin, 'PATCH', { ia_minutas_desk_ids: 'd1,d2', ia_minutas_limite_diario: '5' });
    expect(r.status).toBe(200);
    const filas = await query<{ key: string; value: string }[]>("SELECT `key`, value FROM site_settings WHERE `key` LIKE 'ia_minutas%' ORDER BY `key`");
    expect(filas.map((f) => [f.key, f.value])).toEqual([['ia_minutas_desk_ids', 'd1,d2'], ['ia_minutas_limite_diario', '5']]);
  });

  it('rechaza un límite que no es un número', async () => {
    const admin = await crearUsuario('Admin', 'admin');
    expect((await llamar(`${api.url}/site-settings`, admin, 'PATCH', { ia_minutas_limite_diario: 'muchos' })).status).toBe(400);
  });
});
