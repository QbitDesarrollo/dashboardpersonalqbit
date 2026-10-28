import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '@/lib/apiClient';
import { ActiveTaskTimer } from '@/components/tasks/ActiveTaskTimer';
import { TaskTimer } from '@/components/tasks/TaskTimer';
import { guardarPreferencia } from '@/lib/ventanaFlotante';
import { cerrarVentanaFlotante } from './useVentanaFlotante';

const task = { id: 'a', titulo: 'Ajustar formulario', brand_nombre: 'Dinatek', timer_inicio: new Date().toISOString(), tiempo_trabajado: 3600 };
const state = vi.hoisted(() => ({ timers: [] as api.ActiveTimer[] }));
vi.mock('@/hooks/useActiveTaskTimers', () => ({ useActiveTaskTimers: () => ({ timers: state.timers, isFetching: false }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'user-a' } }) }));
vi.mock('@/lib/apiClient', () => ({
  getTask: vi.fn(), getTasks: vi.fn(), getSubtasks: vi.fn(), getGoogleCalendarEvents: vi.fn(),
  getActiveTimers: vi.fn(), patchTask: vi.fn(), getActiveTimeSession: vi.fn(), stopTimeSession: vi.fn(), startTimeSession: vi.fn(),
}));
let client: QueryClient;
let pip: Window;
let requestWindow: ReturnType<typeof vi.fn>;
function renderUI(ui = <ActiveTaskTimer />) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  state.timers = [task];
  const doc = document.implementation.createHTMLDocument('PiP');
  Object.defineProperty(doc, 'defaultView', { value: window });
  pip = Object.assign(new EventTarget(), { document: doc, close: vi.fn(), focus: vi.fn(), innerWidth: 360, innerHeight: 380 }) as unknown as Window;
  requestWindow = vi.fn().mockResolvedValue(pip);
  vi.stubGlobal('documentPictureInPicture', { requestWindow });
  vi.mocked(api.getTask).mockResolvedValue({ titulo_tarea: task.titulo, brands: { nombre: 'Dinatek' }, prioridad: 'alta', estimated_hours: 2 });
  vi.mocked(api.getTasks).mockResolvedValue({ tasks: [], total: 0 });
  vi.mocked(api.getSubtasks).mockResolvedValue([]);
  vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [] });
  vi.mocked(api.getActiveTimers).mockResolvedValue([]);
  vi.mocked(api.getActiveTimeSession).mockResolvedValue({ session: null });
  vi.mocked(api.patchTask).mockResolvedValue({});
});
afterEach(() => { act(() => cerrarVentanaFlotante()); cleanup(); client.clear(); vi.unstubAllGlobals(); });
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir ventana flotante' }));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir ahora' }));
  await waitFor(() => expect(within(pip.document.body).getByText(task.titulo)).toBeInTheDocument());
  return within(pip.document.body);
}
describe('floating timer', () => {
  it('keeps the unsupported chip without additional controls', () => {
    vi.stubGlobal('documentPictureInPicture', undefined);
    renderUI();
    expect(screen.getByRole('button', { name: `Abrir tarea activa: ${task.titulo}` })).toHaveTextContent('Dinatek');
    expect(screen.queryByRole('button', { name: 'Abrir ventana flotante' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
  it('defaults the switch ON and persists toggles', () => {
    renderUI();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ventana flotante' }));
    const toggle = screen.getByRole('switch', { name: 'Abrir al iniciar una tarea' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.getByText('Desactivado')).toBeInTheDocument();
    expect(localStorage.getItem('tiusdei:pip:auto')).toBe('false');
  });
  it.each([true, false])('opens synchronously from ▶ only when preference is %s', async enabled => {
    guardarPreferencia(localStorage, enabled);
    renderUI(<TaskTimer taskId="a" initialTime={0} isActive={false} startTime={null} canEdit compact />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar timer' }));
    expect(requestWindow).toHaveBeenCalledTimes(enabled ? 1 : 0);
    await waitFor(() => expect(api.startTimeSession).toHaveBeenCalledWith('a'));
  });
  it('renders brand, title, live timer and estimate; pause stops and closes', async () => {
    renderUI();
    const view = await open();
    expect(view.getByText('Dinatek')).toBeInTheDocument();
    expect(view.getByRole('timer')).toHaveTextContent('01:00:');
    expect(await view.findByRole('progressbar')).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(pip.close).toHaveBeenCalled());
    expect(api.patchTask).toHaveBeenCalledWith('a', expect.objectContaining({ timer_activo: false, timer_inicio: null, tiempo_trabajado_delta: expect.any(Number) }));
  });
  it('uses compact app controls, date-only overdue text and no redundant close', async () => {
    vi.mocked(api.getTask).mockResolvedValue({ titulo_tarea: task.titulo, prioridad: 'alta', fecha_entrega: '2020-09-25T00:00:00Z' });
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    renderUI();
    const view = await open();
    expect(await view.findByText('Vencida · 25 sept')).toHaveClass('text-destructive');
    expect(view.getByRole('heading')).toHaveAttribute('title', task.titulo);
    expect(view.queryByRole('button', { name: 'Cerrar ventana flotante' })).toBeNull();
    expect(pip.document.querySelector('details')).toBeNull();
    expect(view.queryByRole('progressbar')).toBeNull();
    expect(view.queryByText(/Hoy:/)).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Ir a Tiusdei' }));
    expect(focus).toHaveBeenCalledOnce();
    expect(api.patchTask).not.toHaveBeenCalled();
    focus.mockRestore();
  });
  it('mirrors light/dark theme on opening and subsequent changes', async () => {
    document.documentElement.classList.add('dark');
    renderUI();
    await open();
    expect(pip.document.documentElement).toHaveClass('dark');
    document.documentElement.classList.remove('dark');
    await waitFor(() => expect(pip.document.documentElement).not.toHaveClass('dark'));
  });
  it('finishes with the same check_done field as the task list', async () => {
    renderUI();
    const view = await open();
    fireEvent.click(view.getByRole('button', { name: 'Terminar' }));
    await waitFor(() => expect(api.patchTask).toHaveBeenCalledWith('a', { check_done: true }));
    expect(pip.close).toHaveBeenCalled();
  });
  it('closing PiP does not stop the timer; an empty active-timer feed closes PiP', async () => {
    const ui = renderUI();
    await open();
    act(() => pip.dispatchEvent(new Event('pagehide')));
    expect(api.patchTask).not.toHaveBeenCalled();
    await open();
    state.timers = [];
    ui.rerender(<QueryClientProvider client={client}><ActiveTaskTimer /></QueryClientProvider>);
    await waitFor(() => expect(pip.close).toHaveBeenCalled());
  });
  it('shows subtasks and the current real meeting, skipping synced tasks and ended meetings', async () => {
    const now = Date.now();
    vi.mocked(api.getSubtasks).mockResolvedValue([
      { id: 's1', titulo_tarea: 'Listo', estado: 'aprobado' },
      { id: 's2', titulo_tarea: 'Revisar copy', estado: 'en_proceso' },
    ]);
    const event = { id: 'meeting', summary: 'Revisión de avance', start: new Date(now - 60000).toISOString(), end: new Date(now + 60000).toISOString(), htmlLink: 'https://calendar.google.com', es_reunion: true, enlace: { url: 'https://meet.google.com/abc', plataforma: 'meet' } };
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [
      { ...event, id: 'old', end: new Date(now - 1000).toISOString() },
      { ...event, id: 'task', es_reunion: false }, event,
    ] });
    renderUI();
    const view = await open();
    expect((await view.findByText('Subtareas 1/2 · Siguiente: Revisar copy')).textContent).toContain('Revisar copy');
    expect(await view.findByText('Ahora · Revisión de avance')).toBeInTheDocument();
    const join = await view.findByRole('link', { name: 'Entrar' });
    expect(join.getAttribute('href')).toBe('https://meet.google.com/abc');
    expect(view.queryByText('Hoy: 2 reuniones')).toBeNull();
    fireEvent.click(join);
    expect(Object.keys(localStorage).some(key => key.includes('reunion:ingreso:meeting'))).toBe(true);
  });
  it('switches tasks through the existing stop/start timer APIs', async () => {
    vi.mocked(api.getTasks).mockResolvedValue({ tasks: [{ id: 'b', titulo_tarea: 'Revisar campaña', estado: 'en_proceso' }], total: 1 });
    renderUI();
    const view = await open();
    fireEvent.click(view.getByText('Cambiar tarea'));
    fireEvent.click(await view.findByRole('button', { name: 'Revisar campaña' }));
    await waitFor(() => expect(api.patchTask).toHaveBeenCalledWith('b', expect.objectContaining({ timer_activo: true })));
    expect(api.patchTask).toHaveBeenNthCalledWith(1, 'a', expect.objectContaining({ timer_activo: false }));
    expect(api.getTasks).toHaveBeenCalledWith({ responsable_user_id: 'user-a', estado: 'en_proceso', limit: 10 });
    expect(pip.close).not.toHaveBeenCalled();
  });
  it('opening failure never blocks starting the task', async () => {
    requestWindow.mockRejectedValue(new Error('Denied'));
    renderUI(<TaskTimer taskId="a" initialTime={0} isActive={false} startTime={null} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    await waitFor(() => expect(api.startTimeSession).toHaveBeenCalledWith('a'));
  });
});
