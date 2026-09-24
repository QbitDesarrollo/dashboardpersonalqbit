import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authRouter } from '../src/routes/auth.js';
import { levantarAppEn, limpiarBase, cerrarLimpieza, crearUsuario, llamar, type Usuario } from './helpers/api.js';
import { query } from '../src/db/mysql.js';

let api: { url: string; cerrar: () => Promise<void> };
let even: Usuario;
const SECRETO = () => process.env.JWT_SECRET!;
const ahora = () => Math.floor(Date.now() / 1000);
const conToken = (u: Usuario, token: string): Usuario => ({ ...u, token });

beforeAll(async () => { api = await levantarAppEn('/api/auth', authRouter); });
afterAll(async () => { await api.cerrar(); await cerrarLimpieza(); });
beforeEach(async () => { await limpiarBase(); even = await crearUsuario('Even', 'equipo'); });

describe('POST /api/auth/renovar', () => {
  it('entrega un token nuevo con 7 días más, el rol actual y el mismo inicio de sesión', async () => {
    const login = ahora() - 3 * 86400;
    const viejo = jwt.sign({ sub: even.id, role: 'equipo', login, iat: login }, SECRETO(), { expiresIn: '7d' });
    await query("UPDATE profiles SET rol = 'ejecutivo' WHERE id = ?", [even.id]);
    await query("UPDATE user_roles SET role = 'ejecutivo' WHERE user_id = ?", [even.id]);
    const r = await llamar(`${api.url}/renovar`, conToken(even, viejo), 'POST');
    expect(r.status).toBe(200);
    const nuevo = jwt.verify(r.body.token, SECRETO()) as jwt.JwtPayload;
    expect(nuevo).toMatchObject({ sub: even.id, role: 'ejecutivo', login });
    expect(nuevo.exp!).toBeGreaterThan(ahora() + 6 * 86400);
  });

  it('un token de antes (sin inicio de sesión guardado) cuenta desde que se emitió', async () => {
    const r = await llamar(`${api.url}/renovar`, even, 'POST');
    expect(r.status).toBe(200);
    const antes = jwt.decode(even.token) as jwt.JwtPayload;
    expect((jwt.decode(r.body.token) as jwt.JwtPayload).login).toBe(antes.iat);
  });

  it('pasados 30 días desde el login con contraseña ya no renueva', async () => {
    const login = ahora() - 31 * 86400;
    const viejo = jwt.sign({ sub: even.id, role: 'equipo', login }, SECRETO(), { expiresIn: '7d' });
    const r = await llamar(`${api.url}/renovar`, conToken(even, viejo), 'POST');
    expect(r).toEqual({ status: 401, body: { error: 'La sesión ya no se puede renovar. Vuelve a entrar.' } });
  });

  it('no renueva a un usuario desactivado ni sin token', async () => {
    await query('UPDATE profiles SET activo = 0 WHERE id = ?', [even.id]);
    expect((await llamar(`${api.url}/renovar`, even, 'POST')).status).toBe(401);
    expect((await llamar(`${api.url}/renovar`, null, 'POST')).status).toBe(401);
  });
});
