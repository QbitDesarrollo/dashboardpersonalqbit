import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, SESION_EXPIRADA, reiniciarAvisoDeSesion } from './apiClient';

// The auth middleware marks its own 401s; other 401s (e.g. "Google no conectado") are not about the session.
const respuesta = (status: number) => Promise.resolve(new Response('{"error":"Token inválido o expirado"}', { status, headers: status === 401 ? { 'X-Tiusdei-Sesion': 'invalida' } : {} }));
const googleNoConectado = () => Promise.resolve(new Response('{"error":"Google no conectado"}', { status: 401 }));

describe('apiRequest · sesión vencida', () => {
  const fetchMock = vi.fn();
  const alVencer = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    alVencer.mockReset();
    reiniciarAvisoDeSesion();
    localStorage.setItem('tiusdei_token', 'token-vencido');
    window.addEventListener(SESION_EXPIRADA, alVencer);
  });
  afterEach(() => { vi.unstubAllGlobals(); window.removeEventListener(SESION_EXPIRADA, alVencer); localStorage.clear(); });

  it('si la API rechaza la sesión, la borra y avisa una sola vez aunque fallen varias peticiones', async () => {
    fetchMock.mockImplementation(() => respuesta(401));
    await apiRequest('/api/data/tasks');
    await apiRequest('/api/data/brands');
    await apiRequest('/api/data/files?task_id=x');
    expect(localStorage.getItem('tiusdei_token')).toBeNull();
    expect(alVencer).toHaveBeenCalledTimes(1);
  });

  it('si vuelve a entrar y la nueva sesión también vence, avisa otra vez', async () => {
    fetchMock.mockImplementation(() => respuesta(401));
    await apiRequest('/api/data/tasks');
    localStorage.setItem('tiusdei_token', 'token-nuevo');
    await apiRequest('/api/data/tasks');
    expect(alVencer).toHaveBeenCalledTimes(2);
  });

  it('una contraseña equivocada en el login no se toma como sesión vencida', async () => {
    fetchMock.mockImplementation(() => respuesta(401));
    await apiRequest('/api/auth/login', { method: 'POST' });
    expect(alVencer).not.toHaveBeenCalled();
    expect(localStorage.getItem('tiusdei_token')).toBe('token-vencido');
  });

  it('un 401 de una integración (Google no conectado) no cierra la sesión', async () => {
    fetchMock.mockImplementation(googleNoConectado);
    await apiRequest('/api/data/google-calendar/events?date=2026-09-25');
    expect(alVencer).not.toHaveBeenCalled();
    expect(localStorage.getItem('tiusdei_token')).toBe('token-vencido');
  });

  it('sin sesión guardada o con respuesta correcta no avisa nada', async () => {
    fetchMock.mockImplementation(() => respuesta(200));
    await apiRequest('/api/data/tasks');
    localStorage.clear();
    fetchMock.mockImplementation(() => respuesta(401));
    await apiRequest('/api/data/tasks');
    expect(alVencer).not.toHaveBeenCalled();
  });
});
