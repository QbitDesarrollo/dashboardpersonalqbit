import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../src/middleware/auth.js';
import { googleCalendarRouter } from '../src/routes/google-calendar.js';
import { levantarApp, limpiarBase, cerrarLimpieza, crearUsuario } from './helpers/api.js';

const privada = Router();
privada.get('/privada', requireAuth, (_req, res) => { res.json({ ok: true }); });

let api: { url: string; cerrar: () => Promise<void> };
beforeAll(async () => { api = await levantarApp(privada, googleCalendarRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });

const pedir = (ruta: string, token?: string) => fetch(`${api.url}${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe('requireAuth · 401 de sesión', () => {
  it('marca sus 401 como sesión inválida: sin token, token falso o vencido', async () => {
    const vencido = jwt.sign({ sub: 'u1', role: 'equipo' }, process.env.JWT_SECRET!, { expiresIn: -10 });
    for (const token of [undefined, 'no-es-un-jwt', vencido]) {
      const r = await pedir('/privada', token);
      expect(r.status).toBe(401);
      expect(r.headers.get('X-Tiusdei-Sesion')).toBe('invalida');
    }
  });

  it('un 401 de Google no conectado no lleva esa marca: la sesión está bien', async () => {
    await limpiarBase();
    const oriana = await crearUsuario('Oriana Barcia', 'equipo');
    const r = await pedir('/google-calendar/events?date=2026-09-25', oriana.token);
    expect(r.status).toBe(401);
    expect(r.headers.get('X-Tiusdei-Sesion')).toBeNull();
  });
});
