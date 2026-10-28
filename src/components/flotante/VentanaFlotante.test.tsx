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
  pip = Object.assign(new EventTarget(), { document: doc, close: vi.fn(), focus: vi.fn(), innerWidth: 320, innerHeight: 210, outerWidth: 320, outerHeight: 240, resizeTo: vi.fn() }) as unknown as Window;
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
    localStorage.setItem('tiusdei:pip:size', JSON.stringify({ width: 280, height: 200 }));
    renderUI();
    const view = await open();
    expect(view.getByText('Dinatek')).toBeInTheDocument();
    expect(requestWindow).toHaveBeenCalledWith({ width: 320, height: 170, preferInitialWindowPlacement: true });
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
    expect(view.getByRole('heading')).toHaveClass('truncate', 'text-[13px]');
    for (const name of ['Pausar', 'Terminar']) {
      const button = view.getByRole('button', { name });
      expect(button).toHaveAttribute('aria-label', name);
      expect(button).toHaveClass('h-8', 'w-8', 'rounded-full');
      expect(button).toHaveTextContent('');
    }
    expect(view.queryByText(/Ahora ·/)).toBeNull();
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
    expect(await view.findByText('· 1/2 subtareas')).toBeInTheDocument();
    expect(view.queryByText(/Siguiente:/)).toBeNull();
    expect(await view.findByText('Ahora · Revisión de avance')).toBeInTheDocument();
    expect(view.getByTestId('reunion-flotante')).toHaveClass('[@media(max-height:229px)]:hidden');
    const controls = view.getByTestId('controles-flotantes');
    expect(controls.parentElement?.lastElementChild).toBe(controls);
    const join = await view.findByRole('link', { name: 'Entrar' });
    expect(join.getAttribute('href')).toBe('https://meet.google.com/abc');
    expect(view.queryByText('Hoy: 2 reuniones')).toBeNull();
    fireEvent.click(join);
    expect(Object.keys(localStorage).some(key => key.includes('reunion:ingreso:meeting'))).toBe(true);
  });
  it('shows only the next meeting today with its Ecuador time and join link', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const event = { id: 'next', summary: 'Kickoff Pycca', start: `${today}T23:58:00-05:00`, end: `${today}T23:59:59-05:00`, htmlLink: 'https://calendar.google.com', es_reunion: true, enlace: { url: 'https://meet.google.com/next', plataforma: 'meet' } };
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [event] });
    renderUI();
    const view = await open();
    expect(await view.findByText('23:58 · Kickoff Pycca')).toBeInTheDocument();
    expect(view.getByRole('link', { name: 'Unirse a Kickoff Pycca' })).toHaveTextContent('Unirse');
  });
  it('omits the meeting row for future days', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    vi.mocked(api.getGoogleCalendarEvents).mockResolvedValue({ events: [{ id: 'later', summary: 'Mañana', start: tomorrow, end: new Date(Date.now() + 90000000).toISOString(), htmlLink: 'https://calendar.google.com', es_reunion: true }] });
    renderUI();
    const view = await open();
    await waitFor(() => expect(api.getGoogleCalendarEvents).toHaveBeenCalled());
    expect(view.queryByText(/Mañana/)).toBeNull();
  });
  it('shows plain description and people context without switching or fetching recent tasks', async () => {
    vi.mocked(api.getTask).mockResolvedValue({ titulo_tarea: task.titulo,
      detalle: '<p>Revisar <strong>copy</strong></p><ul><li>Validar formulario</li></ul>',
      responsables: [{ user_id: '1', nombre: 'Even Fierro' }, { user_id: '2', nombre: 'Ana' }], desks: { nombre: 'Desarrollo' } });
    renderUI();
    const view = await open();
    expect(await view.findByText('Revisar copy Validar formulario')).toHaveClass('line-clamp-2');
    expect(view.getByText('Even Fierro +1 · Desarrollo')).toBeInTheDocument();
    expect(pip.resizeTo).not.toHaveBeenCalled();
    const article = view.getByRole('article');
    expect(article).toHaveClass('h-screen', 'overflow-hidden');
    const controls = view.getByTestId('controles-flotantes');
    expect(controls).toHaveClass('mt-auto', 'shrink-0');
    expect(controls.parentElement?.lastElementChild).toBe(controls);
    expect(view.getByTestId('descripcion-flotante')).toHaveClass('[@media(max-height:299px)]:hidden');
    expect(view.getByTestId('personas-flotante')).toHaveClass('[@media(max-height:259px)]:hidden');
    act(() => cerrarVentanaFlotante());
    await open();
    expect(requestWindow).toHaveBeenLastCalledWith({ width: 320, height: 320, preferInitialWindowPlacement: true });
    expect(pip.resizeTo).not.toHaveBeenCalled();
    expect(view.queryByRole('button', { name: 'Cambiar tarea' })).toBeNull();
    expect(api.getTasks).not.toHaveBeenCalled();
    expect(api.patchTask).not.toHaveBeenCalled();
  });
  it.each([
    [{ profiles: { nombre: 'Even Fierro' } }, 'Even Fierro'],
    [{ desks: { nombre: 'Desarrollo' } }, 'Desarrollo'],
    [{}, null],
  ])('omits missing people pieces and empty descriptions: %j', async (fields, expected) => {
    vi.mocked(api.getTask).mockResolvedValue({ titulo_tarea: task.titulo, detalle: '<p><br></p>', ...fields });
    renderUI();
    const view = await open();
    await waitFor(() => expect(api.getTask).toHaveBeenCalled());
    expect(view.queryByTestId('descripcion-flotante')).toBeNull();
    if (expected) expect(await view.findByText(expected)).toBeInTheDocument();
    else expect(view.queryByTestId('personas-flotante')).toBeNull();
  });
  it.each(['pagehide', 'pause'])('warns only while PiP is open and removes the opener handler on %s', async reason => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    renderUI();
    const view = await open();
    const registration = add.mock.calls.find(([type]) => type === 'beforeunload');
    expect(registration).toBeDefined();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    if (reason === 'pagehide') act(() => pip.dispatchEvent(new Event('pagehide')));
    else {
      fireEvent.click(view.getByRole('button', { name: 'Pausar' }));
      await waitFor(() => expect(pip.close).toHaveBeenCalled());
    }
    expect(remove).toHaveBeenCalledWith('beforeunload', registration![1]);
    if (reason === 'pagehide') expect(api.patchTask).not.toHaveBeenCalled();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    add.mockRestore();
    remove.mockRestore();
  });
  it('opening failure never blocks starting the task', async () => {
    requestWindow.mockRejectedValue(new Error('Denied'));
    const add = vi.spyOn(window, 'addEventListener');
    renderUI(<TaskTimer taskId="a" initialTime={0} isActive={false} startTime={null} canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
    await waitFor(() => expect(api.startTimeSession).toHaveBeenCalledWith('a'));
    expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(false);
    add.mockRestore();
  });
});

describe('floating timer · switching tasks with the window open', () => {
  const otra = { id: 'b', titulo: 'Reel lanzamiento', brand_nombre: 'Nirsa', timer_inicio: new Date().toISOString(), tiempo_trabajado: 0 };
  const arbol = () => (
    <>
      <ActiveTaskTimer />
      <TaskTimer taskId="b" initialTime={0} isActive={false} startTime={null} canEdit compact />
    </>
  );
  beforeEach(() => {
    vi.mocked(api.getTask).mockImplementation(async (id: string) => ({ titulo_tarea: id === 'b' ? otra.titulo : task.titulo, brands: { nombre: 'Dinatek' }, prioridad: 'alta' }));
    vi.mocked(api.getActiveTimers).mockResolvedValue([task]);
  });

  it('keeps the window, does not steal focus, and shows the new task after the existing confirmation', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const vista = renderUI(arbol());
    const pipView = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar timer' }));
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('Ya tienes un timer activo en otra tarea')));
    expect(pip.focus).not.toHaveBeenCalled();
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(pipView.getByText('Cambiando de tarea…')).toBeInTheDocument();
    // Between pausing the old task and starting the new one there is no active timer.
    state.timers = [];
    vista.rerender(<QueryClientProvider client={client}>{arbol()}</QueryClientProvider>);
    expect(pip.close).not.toHaveBeenCalled();
    state.timers = [otra];
    vista.rerender(<QueryClientProvider client={client}>{arbol()}</QueryClientProvider>);
    await waitFor(() => expect(pipView.getByText(otra.titulo)).toBeInTheDocument());
    expect(pip.close).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('cancelling the confirmation keeps the window open on the current task', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderUI(arbol());
    const pipView = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar timer' }));
    await waitFor(() => expect(confirmar).toHaveBeenCalled());
    await waitFor(() => expect(pipView.getByText(task.titulo)).toBeInTheDocument());
    expect(pip.close).not.toHaveBeenCalled();
    expect(api.patchTask).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });
});

describe('floating timer · after reloading the page', () => {
  it('reopens on the first click when it was open and the timer is still running', async () => {
    const { recordarAbierta } = await import('@/lib/ventanaFlotante');
    recordarAbierta(localStorage);
    renderUI();
    expect(requestWindow).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(requestWindow).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(pip.document.body).getByText(task.titulo)).toBeInTheDocument());
    fireEvent.pointerDown(document.body);
    expect(requestWindow).toHaveBeenCalledTimes(1);
  });

  it('does not reopen if it was not open, or if there is no running timer', async () => {
    renderUI();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(requestWindow).not.toHaveBeenCalled();
    cleanup();
    const { recordarAbierta } = await import('@/lib/ventanaFlotante');
    recordarAbierta(localStorage);
    state.timers = [];
    renderUI();
    fireEvent.pointerDown(document.body);
    expect(requestWindow).not.toHaveBeenCalled();
  });

  it('closing it with × forgets it; reloading the page keeps it remembered', async () => {
    const { estabaAbierta } = await import('@/lib/ventanaFlotante');
    renderUI();
    await open();
    expect(estabaAbierta(localStorage)).toBe(true);
    act(() => { window.dispatchEvent(new Event('pagehide')); pip.dispatchEvent(new Event('pagehide')); });
    expect(estabaAbierta(localStorage)).toBe(true);
    await open();
    act(() => pip.dispatchEvent(new Event('pagehide')));
    expect(estabaAbierta(localStorage)).toBe(false);
  });
});
