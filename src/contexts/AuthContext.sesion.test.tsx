import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('@/lib/apiClient', async (orig) => ({
  ...(await orig<typeof import('@/lib/apiClient')>()),
  getMe: vi.fn(async () => ({ id: 'u1', email: 'even@qbit.ec', nombre: 'Even', rol: 'admin' })),
  renovarSesion: vi.fn(async () => ({ token: 'token-renovado' })),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), success: vi.fn() }) }));

function Quien() {
  const { user, loading } = useAuth();
  return <p>{loading ? 'cargando' : user ? `sesión de ${user.nombre}` : 'sin sesión'}</p>;
}

describe('AuthProvider · sesión vencida', () => {
  it('cuando la API avisa que la sesión venció, la cierra y lo dice', async () => {
    localStorage.setItem('tiusdei_token', 'token');
    render(<AuthProvider><Quien /></AuthProvider>);
    expect(await screen.findByText('sesión de Even')).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event(api.SESION_EXPIRADA)); });
    expect(screen.getByText('sin sesión')).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith('Tu sesión venció. Vuelve a entrar.');
  });
});

const tokenDe = (iat: number) => `x.${btoa(JSON.stringify({ sub: 'u1', iat })).replace(/=+$/, '')}.y`;

describe('AuthProvider · renovación', () => {
  it('con un token de hace más de 12 horas renueva la sesión en silencio', async () => {
    vi.mocked(api.renovarSesion).mockClear();
    localStorage.setItem('tiusdei_token', tokenDe(Math.floor(Date.now() / 1000) - 13 * 3600));
    render(<AuthProvider><Quien /></AuthProvider>);
    expect(await screen.findByText('sesión de Even')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('tiusdei_token')).toBe('token-renovado'));
  });

  it('con un token reciente no pide nada', async () => {
    vi.mocked(api.renovarSesion).mockClear();
    localStorage.setItem('tiusdei_token', tokenDe(Math.floor(Date.now() / 1000) - 60));
    render(<AuthProvider><Quien /></AuthProvider>);
    expect(await screen.findByText('sesión de Even')).toBeInTheDocument();
    expect(api.renovarSesion).not.toHaveBeenCalled();
  });
});

