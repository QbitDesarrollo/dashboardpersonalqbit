import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('@/lib/apiClient', async (orig) => ({
  ...(await orig<typeof import('@/lib/apiClient')>()),
  getMe: vi.fn(async () => ({ id: 'u1', email: 'even@qbit.ec', nombre: 'Even', rol: 'admin' })),
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
