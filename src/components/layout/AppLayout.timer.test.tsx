import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/contexts/AuthContext';
import { GlobalFilterProvider } from '@/contexts/GlobalFilterContext';
import { AppLayout } from './AppLayout';

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), emit: vi.fn(), off: vi.fn(), disconnect: vi.fn() }) }));

const task = {
  id: 'task-a', titulo: 'Adjust contact form', brand_nombre: 'Demo',
  timer_inicio: new Date(Date.now() - 60_000).toISOString(), tiempo_trabajado: 3600,
};
let activeTimers = [task];
let role = 'equipo';
let client: QueryClient;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tiusdei_token', 'test-session');
  localStorage.setItem('tiusdei_theme_manual', 'true');
  activeTimers = [task];
  role = 'equipo';
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    let data: unknown = [];
    if (path === '/api/auth/me') data = { id: 'user-a', nombre: 'Demo user', email: 'demo@example.test', rol: role, activo: true };
    if (path.endsWith('/site-settings')) data = {};
    if (path.endsWith('/active-timer')) data = activeTimers;
    if (path.endsWith('/tasks/task-a')) data = {
      id: task.id, titulo_tarea: task.titulo, tiempo_trabajado: task.tiempo_trabajado,
      timer_inicio: task.timer_inicio, timer_activo: true, estado: 'en_proceso', prioridad: 'media',
      cantidad_entregables: 1, responsable_user_id: 'user-a', brands: { nombre: 'Demo' },
    };
    if (path.endsWith('/time-sessions/active')) data = { session: null };
    if (path.endsWith('/heartbeat')) data = { active: false };
    if (path.endsWith('/resume-suggestion')) data = {};
    if (path.endsWith('/attendance/today')) data = { attendance: null };
    if (path.endsWith('/notifications/count')) data = { count: 0 };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });

function renderLayout() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="light">
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider><GlobalFilterProvider><AppLayout><p>Page content</p></AppLayout></GlobalFilterProvider></AuthProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('AppLayout active task timer', () => {
  it('shows the running task in the persistent header with its accumulated time', async () => {
    renderLayout();
    const indicator = await screen.findByRole('button', { name: 'Abrir tarea activa: Adjust contact form' });
    expect(indicator).toHaveTextContent('Demo');
    expect(indicator).toHaveTextContent('01:01:');
    expect(indicator.closest('header')).not.toBeNull();
  });

  it('removes the indicator as soon as a timer change reports no running task', async () => {
    renderLayout();
    await screen.findByRole('button', { name: /Abrir tarea activa:/ });
    activeTimers = [];
    act(() => window.dispatchEvent(new Event('tiusdei:timer-changed')));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Abrir tarea activa:/ })).not.toBeInTheDocument());
  });

  it('opens the actual task detail with the same timer', async () => {
    renderLayout();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir tarea activa:/ }));
    const dialog = await screen.findByRole('dialog', { name: /Adjust contact form/ });
    expect(dialog).toHaveAccessibleDescription('Información completa, timer, comentarios y entregables.');
    const timers = document.querySelectorAll('[role="timer"]');
    expect(timers).toHaveLength(2);
    expect(timers[0].textContent).toBe(timers[1].textContent);
  });

  it('does not request employee timers for client accounts', async () => {
    role = 'cliente';
    renderLayout();
    await screen.findByText('Portal Cliente');
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/active-timer'))).toBe(false);
  });
});
