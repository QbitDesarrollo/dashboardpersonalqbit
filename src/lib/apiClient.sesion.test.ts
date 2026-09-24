import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, SESION_EXPIRADA, reiniciarAvisoDeSesion } from './apiClient';

const respuesta = (status: number) => Promise.resolve(new Response('{"error":"Token inválido o expirado"}', { status }));

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

  it('sin sesión guardada o con respuesta correcta no avisa nada', async () => {
    fetchMock.mockImplementation(() => respuesta(200));
    await apiRequest('/api/data/tasks');
    localStorage.clear();
    fetchMock.mockImplementation(() => respuesta(401));
    await apiRequest('/api/data/tasks');
    expect(alVencer).not.toHaveBeenCalled();
  });
});
