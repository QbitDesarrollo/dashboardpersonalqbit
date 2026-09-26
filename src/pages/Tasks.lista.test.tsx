/**
 * Tasks page list: what gets loaded, which response wins, how each row behaves and
 * how much of the table redraws on each interaction.
 */
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import Tasks from './Tasks';

vi.mock('@/lib/apiClient', () => {
  const definidas: Record<string, unknown> = {};
  return new Proxy(definidas, {
    get: (obj, key: string) => {
      if (key === 'then' || key === '__esModule') return undefined;
      if (!(key in obj)) obj[key] = vi.fn(async () => []);
      return obj[key];
    },
    has: () => true,
  });
});
vi.mock('@/lib/api', () => ({ sendTaskNotification: vi.fn(async () => ({})) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', nombre: 'Even', rol: 'admin' }, user: { id: 'u1' }, isAdmin: true, isEjecutivo: false, isEquipo: false, isCliente: false }),
}));
vi.mock('@/contexts/GlobalFilterContext', () => ({ useGlobalFilter: () => ({ pinnedDeskId: null, pinnedBrandId: null }) }));
vi.mock('@/components/RichTextEditor', () => ({ RichTextEditor: () => null, RichTextViewer: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock('@/components/TodayMeetings', () => ({ TodayMeetings: () => null }));
vi.mock('@/components/tasks/ResponsableMetrics', () => ({ ResponsableMetrics: ({ userName }: { userName: string }) => <span>{userName}</span> }));
vi.mock('@/components/tasks/TaskFiles', () => ({ TaskFiles: () => null }));
vi.mock('@/components/tasks/SubtaskList', () => ({ SubtaskList: ({ taskId }: { taskId: string }) => <p>Subtareas de {taskId}</p> }));

// Each row draws one timer: counting its renders tells how many rows redrew.
const dibujosDeTimer: Record<string, number> = {};
vi.mock('@/components/tasks/TaskTimer', () => ({
  TaskTimer: ({ taskId }: { taskId: string }) => {
    dibujosDeTimer[taskId] = (dibujosDeTimer[taskId] ?? 0) + 1;
    return null;
  },
}));

const m = vi.mocked(api) as unknown as Record<string, ReturnType<typeof vi.fn>>;

const BRANDS = [{ id: 'b1', nombre: 'Dinatek', activo: 1 }, { id: 'b2', nombre: 'Pronaca', activo: 1 }];
const DESKS = [{ id: 'd1', nombre: 'Mesa Digital', activo: 1 }];

const tarea = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, titulo_tarea: titulo, detalle: null, brand_id: 'b1', desk_id: 'd1', responsable_user_id: null, responsables: [],
  departamento: null, department_id: null, project_id: null, prioridad: 'media', estado: 'en_proceso',
  fecha_inicio: null, fecha_entrega: '2026-10-30', cantidad_entregables: 2, enlaces: null, tiempo_trabajado: 0,
  timer_activo: false, timer_inicio: null, is_read: true, created_at: '2026-09-20T10:00:00.000Z',
  brands: { nombre: 'Dinatek' }, desks: { nombre: 'Mesa Digital' }, ...extra,
});
const CARRUSEL = tarea('t1', 'Carrusel de lanzamiento');
const REEL = tarea('t2', 'Reel de temporada', { prioridad: 'alta' });

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(dibujosDeTimer)) delete dibujosDeTimer[k];
  Object.values(m).forEach((fn) => fn.mockReset?.().mockImplementation?.(async () => []));
  m.getTasks.mockResolvedValue({ tasks: [CARRUSEL, REEL], total: 2 });
  m.getBrands.mockResolvedValue(BRANDS);
  m.getDesks.mockResolvedValue(DESKS);
  m.getProfiles.mockResolvedValue([{ id: 'u1', nombre: 'Even' }]);
  m.getSiteSettings.mockResolvedValue({});
  m.getTask.mockImplementation(async (id: string) => [CARRUSEL, REEL].find((t) => t.id === id));
  m.patchTask.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});

function renderTasks(ruta = '/tareas') {
  return render(
    <MemoryRouter initialEntries={[ruta]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Tasks />
    </MemoryRouter>,
  );
}

const filtro = (prefijo: string) => screen.getAllByRole('combobox').find((c) => c.textContent?.startsWith(prefijo)) as HTMLElement;
async function elegirEnFiltro(combo: HTMLElement, opcion: string) {
  fireEvent.keyDown(combo, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: opcion }));
  await act(async () => {});
}
const fila = (titulo: string) => screen.getByText(titulo).closest('tr') as HTMLElement;

describe('Tasks · carga de la lista', () => {
  it('al cambiar un filtro vuelve a pedir las tareas, pero no las marcas, mesas ni personas', async () => {
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    const antes = { marcas: m.getBrands.mock.calls.length, mesas: m.getDesks.mock.calls.length, personas: m.getProfiles.mock.calls.length, tareas: m.getTasks.mock.calls.length };

    await elegirEnFiltro(filtro('Marca:'), 'Dinatek');

    await waitFor(() => expect(m.getTasks.mock.calls.length).toBeGreaterThan(antes.tareas));
    expect(m.getBrands.mock.calls.length).toBe(antes.marcas);
    expect(m.getDesks.mock.calls.length).toBe(antes.mesas);
    expect(m.getProfiles.mock.calls.length).toBe(antes.personas);
  });

  it('si la respuesta de un filtro anterior llega tarde, se queda con la del último filtro', async () => {
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    let soltarVieja: (v: unknown) => void = () => {};
    m.getTasks.mockImplementation((opts: { brand_id?: string }) => (opts.brand_id === 'b1'
      ? new Promise((r) => { soltarVieja = r; })
      : Promise.resolve({ tasks: [tarea('t9', 'Tarea de Pronaca', { brand_id: 'b2', brands: { nombre: 'Pronaca' } })], total: 1 })));

    await elegirEnFiltro(filtro('Marca:'), 'Dinatek');
    await elegirEnFiltro(filtro('Marca:'), 'Pronaca');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    await screen.findByText('Tarea de Pronaca');
    await act(async () => { soltarVieja({ tasks: [tarea('t8', 'Tarea vieja de Dinatek')], total: 1 }); });

    expect(screen.queryByText('Tarea vieja de Dinatek')).not.toBeInTheDocument();
    expect(screen.getByText('Tarea de Pronaca')).toBeInTheDocument();
  });

  it('busca 400 ms después de la última tecla', async () => {
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    const buscador = screen.getByPlaceholderText('Buscar tareas...');
    fireEvent.change(buscador, { target: { value: 'ree' } });
    fireEvent.change(buscador, { target: { value: 'reel' } });
    expect(m.getTasks).not.toHaveBeenLastCalledWith(expect.objectContaining({ search: 'reel' }));
    await waitFor(() => expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'reel' })));
    expect(m.getTasks).not.toHaveBeenCalledWith(expect.objectContaining({ search: 'ree' }));
    expect(buscador).toHaveValue('reel');
  });
});

/** YYYY-MM-DD, `dias` days from today (local time, like the row computes it). */
function enDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Tasks · fila de tarea (caracterización)', () => {
  it('muestra marca, mesa, responsables, entregables, prioridad, estado y la urgencia de la entrega', async () => {
    m.getTasks.mockResolvedValue({
      tasks: [
        tarea('t1', 'Carrusel de lanzamiento', { fecha_entrega: enDias(-3), responsables: [{ user_id: 'u2', nombre: 'Diego Ruiz' }], read_count: 2, is_read: false }),
        tarea('t2', 'Reel de temporada', { fecha_entrega: enDias(1), prioridad: 'alta', estado: 'backlog' }),
        tarea('t3', 'Banner web', { fecha_entrega: enDias(0), estado: 'entregado' }),
      ],
      total: 3,
    });
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');

    const carrusel = within(fila('Carrusel de lanzamiento'));
    expect(carrusel.getByText('Dinatek')).toBeInTheDocument();
    expect(carrusel.getByText('Mesa Digital')).toBeInTheDocument();
    expect(carrusel.getByText('Diego Ruiz')).toBeInTheDocument();
    expect(carrusel.getByText('2 vistos')).toBeInTheDocument();
    expect(carrusel.getByTitle('No leída')).toBeInTheDocument();
    expect(carrusel.getByText('+3d')).toHaveAttribute('title', '3 día(s) de atraso');
    expect(carrusel.getAllByRole('combobox').map((c) => c.textContent)).toEqual(['MEDIA', 'En Proceso']);

    const reel = within(fila('Reel de temporada'));
    expect(reel.getByText('Sin asignar')).toBeInTheDocument();
    expect(reel.getByText('1d')).toHaveAttribute('title', 'Vence en 1 día(s)');
    expect(reel.getAllByRole('combobox').map((c) => c.textContent)).toEqual(['ALTA', 'Pendiente']);
    expect(reel.queryByTitle('No leída')).not.toBeInTheDocument();

    const banner = within(fila('Banner web'));
    expect(banner.queryByText('Hoy')).not.toBeInTheDocument();
  });

  it('cambia estado y prioridad desde la fila y recarga la lista', async () => {
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    const [prioridad, estado] = within(fila('Carrusel de lanzamiento')).getAllByRole('combobox');

    await elegirEnFiltro(estado, 'Entregado');
    await waitFor(() => expect(m.patchTask).toHaveBeenCalledWith('t1', { estado: 'entregado' }));
    await elegirEnFiltro(prioridad, 'BAJA');
    await waitFor(() => expect(m.patchTask).toHaveBeenCalledWith('t1', { prioridad: 'baja' }));
    await waitFor(() => expect(m.getTasks).toHaveBeenCalledTimes(3));
  });

  it('marca favorita, selecciona, expande subtareas, abre el detalle y elimina', async () => {
    m.getTasks.mockResolvedValue({ tasks: [tarea('t1', 'Carrusel de lanzamiento', { subtask_count: 2, subtask_done_count: 1 }), REEL], total: 2 });
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    const carrusel = () => within(fila('Carrusel de lanzamiento'));

    fireEvent.click(carrusel().getAllByRole('button').find((b) => b.querySelector('svg.lucide-star'))!);
    await waitFor(() => expect(m.patchTask).toHaveBeenCalledWith('t1', { is_favorite: true }));
    await waitFor(() => expect(fila('Carrusel de lanzamiento').querySelector('svg.lucide-star')).toHaveClass('fill-current'));

    fireEvent.click(carrusel().getByRole('checkbox', { name: 'Seleccionar tarea' }));
    expect(await screen.findByText('1 seleccionada')).toBeInTheDocument();

    fireEvent.click(carrusel().getByTitle('1 de 2 subtareas completadas. Click para expandir.'));
    expect(await screen.findByText('Subtareas de t1')).toBeInTheDocument();
    expect(m.getSubtasks).toHaveBeenCalledWith('t1');

    fireEvent.click(carrusel().getByText('Carrusel de lanzamiento'));
    await waitFor(() => expect(m.markTaskRead).toHaveBeenCalledWith('t1'));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await act(async () => {});

    fireEvent.click(carrusel().getAllByRole('button', { hidden: true }).find((b) => b.querySelector('svg.lucide-trash2, svg.lucide-trash-2'))!);
    await waitFor(() => expect(m.deleteTask).toHaveBeenCalledWith('t1'));
    expect(confirmar).toHaveBeenCalled();
    confirmar.mockRestore();
  });
});

describe('Tasks · cuánto se redibuja', () => {
  it('buscar no recarga la pantalla: el buscador conserva el foco y la tabla sigue a la vista', async () => {
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    let soltar: (v: unknown) => void = () => {};
    m.getTasks.mockImplementation(() => new Promise((r) => { soltar = r; }));
    const buscador = screen.getByPlaceholderText('Buscar tareas...');
    buscador.focus();
    fireEvent.change(buscador, { target: { value: 'reel' } });
    await waitFor(() => expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'reel' })));

    expect(document.activeElement).toBe(buscador);
    expect(screen.getByText('Carrusel de lanzamiento')).toBeInTheDocument();
    await act(async () => { soltar({ tasks: [REEL], total: 1 }); });
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Buscar tareas...'));
    expect(screen.queryByText('Carrusel de lanzamiento')).not.toBeInTheDocument();
  });

  it('escribir en el buscador no vuelve a dibujar las filas', async () => {
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    const antes = { ...dibujosDeTimer };

    const buscador = screen.getByPlaceholderText('Buscar tareas...');
    for (const texto of ['c', 'ca', 'car']) fireEvent.change(buscador, { target: { value: texto } });

    expect(dibujosDeTimer).toEqual(antes);
  });

  it('seleccionar una tarea solo vuelve a dibujar su fila', async () => {
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    const antes = { ...dibujosDeTimer };

    fireEvent.click(within(fila('Carrusel de lanzamiento')).getByRole('checkbox', { name: 'Seleccionar tarea' }));
    await screen.findByText('1 seleccionada');

    expect(dibujosDeTimer.t2).toBe(antes.t2);
    expect(dibujosDeTimer.t1).toBeGreaterThan(antes.t1);
  });
});

describe('Tasks · recuerda los filtros', () => {
  const primeraCarga = () => m.getTasks.mock.calls[0][0];

  it('al volver a entrar abre con los filtros que la persona dejó puestos', async () => {
    const { unmount } = renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    await elegirEnFiltro(filtro('Marca:'), 'Dinatek');
    await elegirEnFiltro(filtro('Resp:'), 'Even');
    await act(async () => {});
    unmount();
    m.getTasks.mockClear();

    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    expect(primeraCarga()).toMatchObject({ brand_id: 'b1', responsable_user_id: 'u1' });
    expect(filtro('Marca:')).toHaveTextContent('Dinatek');
  });

  it('también recuerda el proyecto elegido dentro de la marca', async () => {
    m.getProjects.mockResolvedValue([{ id: 'p1', nombre: 'Portal' }]);
    const { unmount } = renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    await elegirEnFiltro(filtro('Marca:'), 'Dinatek');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Proyecto' })).toBeEnabled());
    await elegirEnFiltro(screen.getByRole('combobox', { name: 'Proyecto' }), 'Portal');
    await act(async () => {});
    unmount();
    m.getTasks.mockClear();

    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    expect(primeraCarga()).toMatchObject({ brand_id: 'b1', project_id: 'p1' });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ brand_id: 'b1', project_id: 'p1' }));
  });

  it('un enlace con ?responsable manda sobre lo recordado', async () => {
    localStorage.setItem('tareas_filtros:u1', JSON.stringify({ responsable: 'u9', brand: 'b1' }));
    renderTasks('/tareas?responsable=u2');
    await screen.findByText('Carrusel de lanzamiento');
    expect(primeraCarga()).toMatchObject({ responsable_user_id: 'u2', brand_id: 'b1' });
  });

  it('"Ver en Tareas" de un proyecto abre solo con ese proyecto, sin lo recordado ni el filtro predeterminado', async () => {
    localStorage.setItem('tareas_filtros:u1', JSON.stringify({ brand: 'b2', status: 'backlog', responsable: 'u9' }));
    m.getSavedFilters.mockResolvedValue([{ id: 'f1', name: 'Pronaca', is_default: 1, filter_config: { brand_id: 'b2' } }]);
    m.getProjects.mockResolvedValue([{ id: 'p1', nombre: 'Portal' }]);
    renderTasks('/tareas?brand=b1&project=p1');
    await screen.findByText('Carrusel de lanzamiento');
    expect(primeraCarga()).toMatchObject({ brand_id: 'b1', project_id: 'p1' });
    expect(primeraCarga().estado).not.toBe('backlog');
    expect(primeraCarga().responsable_user_id).not.toBe('u9');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ brand_id: 'b1', project_id: 'p1' }));
  });

  it('el enlace de un proyecto tampoco se pisa con el filtro predeterminado cuando no hay nada recordado', async () => {
    m.getSavedFilters.mockResolvedValue([{ id: 'f1', name: 'Pronaca', is_default: 1, filter_config: { brand_id: 'b2' } }]);
    m.getProjects.mockResolvedValue([{ id: 'p1', nombre: 'Portal' }]);
    renderTasks('/tareas?brand=b1&project=p1');
    await screen.findByText('Carrusel de lanzamiento');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(m.getTasks).not.toHaveBeenCalledWith(expect.objectContaining({ brand_id: 'b2' }));
    expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ brand_id: 'b1', project_id: 'p1' }));
  });

  it('con filtros recordados no aplica el filtro guardado como predeterminado', async () => {
    localStorage.setItem('tareas_filtros:u1', JSON.stringify({ brand: 'b1' }));
    m.getSavedFilters.mockResolvedValue([{ id: 'f1', name: 'Pronaca', is_default: 1, filter_config: { brand_id: 'b2' } }]);
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(m.getTasks).not.toHaveBeenCalledWith(expect.objectContaining({ brand_id: 'b2' }));
    expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ brand_id: 'b1' }));
  });

  it('sin filtros recordados sí aplica el filtro predeterminado, como hasta hoy', async () => {
    m.getSavedFilters.mockResolvedValue([{ id: 'f1', name: 'Pronaca', is_default: 1, filter_config: { brand_id: 'b2' } }]);
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    await waitFor(() => expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ brand_id: 'b2' })));
  });

  it('si la marca o la mesa recordada ya no existe, vuelve a "todas"', async () => {
    localStorage.setItem('tareas_filtros:u1', JSON.stringify({ brand: 'b-desactivada', desk: 'd-cerrada', status: 'backlog' }));
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    await waitFor(() => expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ brand_id: 'all', desk_id: undefined, estado: 'backlog' })));
  });
});
