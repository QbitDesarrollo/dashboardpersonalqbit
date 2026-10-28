import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import * as api from '@/lib/apiClient';
import * as dashboardApi from '@/lib/dashboardApi';
import Dashboard from './Dashboard';

const contexto = vi.hoisted(() => ({ equipo: false, usuario: 'u1', marca: null as string | null, mesa: null as string | null }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (original) => ({ ...await original<typeof import('react-router-dom')>(), useNavigate: () => navigate }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  profile: { id: contexto.usuario, nombre: 'Even' }, isAdmin: !contexto.equipo, isEjecutivo: false,
  isEquipo: contexto.equipo, isCliente: false, canViewAll: !contexto.equipo,
}) }));
vi.mock('@/contexts/GlobalFilterContext', () => ({ useGlobalFilter: () => ({ pinnedBrandId: contexto.marca, pinnedDeskId: contexto.mesa }) }));
vi.mock('@/components/GoogleCalendarWidget', () => ({ default: () => null }));
vi.mock('@/lib/dashboardApi', () => ({ getDashboardTasks: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({
  getProfiles: vi.fn(), getBrands: vi.fn(), getDesks: vi.fn(), getRecentActivity: vi.fn(),
  apiRequest: vi.fn(), getGoogleCalendarStatus: vi.fn(), getGoogleCalendarEvents: vi.fn(), getTeamLiveStatus: vi.fn(),
}));
// jsdom cannot size charts. Keep the data and series visible to characterize what is counted.
vi.mock('recharts', async () => {
  const { createContext, useContext } = await import('react');
  interface Dato { id: string; nombre: string; [key: string]: unknown }
  const Datos = createContext<Dato[]>([]);
  const contenedor = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: contenedor, PieChart: contenedor,
    BarChart: ({ data, children }: { data: Dato[]; children?: ReactNode }) => <Datos.Provider value={data}><div data-testid="barras"><pre>{JSON.stringify(data)}</pre>{children}</div></Datos.Provider>,
    Pie: ({ data, onClick }: { data: { id?: string; estado?: string; nombre?: string; name?: string }[]; onClick?: (dato: unknown) => void }) => <div data-testid="pastel">{JSON.stringify(data)}{onClick && data.map((d) => <button key={d.id ?? d.estado} onClick={() => onClick(d)}>Sector {d.nombre ?? d.name}</button>)}</div>,
    Bar: ({ dataKey, onClick }: { dataKey: string; onClick?: (dato: { payload: Dato }) => void }) => {
      const datos = useContext(Datos);
      return <div>{dataKey}{onClick && datos.filter((d) => Number(d[dataKey]) > 0).map((d) => <button key={d.id} onClick={() => onClick({ payload: d })}>{dataKey} de {d.nombre}</button>)}</div>;
    },
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Cell: () => null, Legend: () => null,
  };
});

describe('Dashboard · consultar las tareas de los indicadores', () => {
  it('abre las tareas del estado seleccionado y permite navegar a una por ID', async () => {
    abrir(); fireEvent.click(await screen.findByRole('button', { name: 'Ver tareas: En Revisión' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('button', { name: 'Abrir Tarea revision' })).toBeInTheDocument();
    expect(within(dialogo).queryByText('Tarea activa')).not.toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Abrir Tarea revision' }));
    expect(navigate).toHaveBeenCalledWith('/tareas?task=revision');
  });
  it('abre solo las tareas de ese responsable y de ese segmento de la barra', async () => {
    abrir(); fireEvent.click(await screen.findByRole('button', { name: 'enProgreso de Even' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Tarea activa')).toBeInTheDocument();
    expect(within(dialogo).getByText('Tarea revision')).toBeInTheDocument();
    expect(within(dialogo).queryByText('Tarea otra')).not.toBeInTheDocument();
    expect(within(dialogo).queryByText('Tarea aprobada')).not.toBeInTheDocument();
  });
  it('la lista respeta marca, mesa y fechas del dashboard', async () => {
    contexto.marca = 'b1'; contexto.mesa = 'd1'; localStorage.setItem('dashboard_periodo', 'custom');
    localStorage.setItem('dashboard_periodo_desde', '2026-10-01'); localStorage.setItem('dashboard_periodo_hasta', '2026-10-31');
    abrir(); fireEvent.click(await screen.findByRole('button', { name: 'Ver tareas: Tareas Activas' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getAllByRole('button', { name: /^Abrir Tarea/ })).toHaveLength(2);
    expect(dialogo).not.toHaveTextContent('Tarea otra'); expect(dialogo).not.toHaveTextContent('Tarea atrasada');
  });
  it('el equipo no recibe las tareas de otro responsable al abrir una tarjeta', async () => {
    contexto.equipo = true; abrir(); fireEvent.click(await screen.findByRole('button', { name: 'Ver tareas: Mis Tareas Activas' }));
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Tarea otra');
  });
  it('carga todo el historial con una petición antes de contar', async () => {
    abrir(); await screen.findByRole('button', { name: 'Ver tareas: Tareas Activas' });
    expect(tarjeta('Tareas Activas')).toHaveTextContent('3');
    expect(dashboardApi.getDashboardTasks).toHaveBeenCalledTimes(1);
  });
  it('muestra un error recuperable si falla la carga', async () => {
    vi.mocked(dashboardApi.getDashboardTasks).mockRejectedValueOnce(new Error('Sin conexión'));
    abrir(); expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar todos los datos');
    expect(screen.queryByText('Tareas Activas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }));
    expect(await screen.findByText('Tareas Activas')).toBeInTheDocument();
  });
  it('el gráfico de marca abre sus tareas y la búsqueda filtra por título', async () => {
    abrir(); fireEvent.click(within(await screen.findByTestId('marcas-barras')).getByRole('button', { name: 'Ver tareas de Dinatek' }));
    const dialogo = screen.getByRole('dialog'); expect(dialogo).not.toHaveTextContent('Tarea otra');
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Buscar en estas tareas' }), { target: { value: 'aprobada' } });
    expect(within(dialogo).getAllByRole('button', { name: /^Abrir / })).toHaveLength(1);
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'no existe' } });
    expect(dialogo).toHaveTextContent('No hay tareas que coincidan');
  });
  it('las barras de progreso abren un grupo vacío sin fallar', async () => {
    vi.mocked(dashboardApi.getDashboardTasks).mockResolvedValue([]);
    abrir(); fireEvent.click(await screen.findByRole('button', { name: 'Ver progreso: Pendiente' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('No hay tareas en este grupo');
  });
  it('el gráfico personal por estado y el de marca conservan la selección propia', async () => {
    contexto.equipo = true; abrir(); fireEvent.click(await screen.findByRole('button', { name: 'Sector Aprobado' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Tarea aprobada');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Tarea entregada');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(within(screen.getByTestId('marcas-barras')).getByRole('button', { name: 'Ver tareas de Dinatek' }));
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Tarea otra');
  });
  it('ignora una respuesta vieja después de cambiar de usuario', async () => {
    let completar!: (r: Awaited<ReturnType<typeof dashboardApi.getDashboardTasks>>) => void;
    vi.mocked(dashboardApi.getDashboardTasks).mockImplementationOnce(() => new Promise((resolve) => { completar = resolve; }))
      .mockResolvedValueOnce([tarea('nueva', 'en_proceso')]);
    const vista = abrir(); contexto.usuario = 'u2';
    vista.rerender(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Dashboard /></MemoryRouter>);
    await screen.findByText('Tareas Activas');
    await act(async () => { completar(tareas); });
    expect(tarjeta('Tareas Activas')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'Ver tareas: Tareas Activas' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Tarea nueva');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Tarea activa');
  });
});

describe('Dashboard · rediseño compartido', () => {
  it.each([false, true])('comparte barras por marca y progreso con equipo=%s', async (equipo) => {
    contexto.equipo = equipo; abrir();
    const marcas = await screen.findByTestId('marcas-barras');
    expect(within(marcas).getByRole('button', { name: 'Ver tareas de Dinatek' })).toHaveTextContent('6');
    expect(screen.getByText(equipo ? 'Mi Progreso' : 'Progreso')).toBeInTheDocument();
    expect(screen.getByText(equipo ? '33%' : '29%', { selector: 'strong' }).closest('p')).toHaveTextContent(equipo ? '33% entregadas' : '29% entregadas');
    fireEvent.click(screen.getByRole('button', { name: 'Ver progreso: Aprobado' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Tarea aprobada');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Tarea entregada');
  });
  it.each([false, true])('filtra grupos urgentes sin aprobadas con equipo=%s', async (equipo) => {
    contexto.equipo = equipo;
    vi.mocked(dashboardApi.getDashboardTasks).mockResolvedValue([
      tarea('ayer', 'backlog', { fecha_entrega: '2026-10-01' }),
      tarea('hoy', 'en_proceso', { fecha_entrega: '2026-10-02' }),
      tarea('semana', 'en_proceso', { fecha_entrega: '2026-10-09' }),
      tarea('fuera', 'en_proceso', { fecha_entrega: '2026-10-10' }),
      tarea('aprobada', 'aprobado', { fecha_entrega: '2026-10-01' }),
    ]);
    abrir(); const urgentes = await screen.findByRole('region', { name: equipo ? 'Mis Tareas Urgentes' : 'Tareas Urgentes' });
    expect(urgentes).toHaveTextContent('Tarea ayer'); expect(urgentes).not.toHaveTextContent('Tarea aprobada');
    expect(urgentes).not.toHaveTextContent('Tarea fuera');
    if (!equipo) expect(urgentes).toHaveTextContent('Even');
    fireEvent.click(within(urgentes).getByRole('button', { name: 'Hoy 1' }));
    expect(urgentes).toHaveTextContent('Tarea hoy'); expect(urgentes).not.toHaveTextContent('Tarea ayer');
    fireEvent.click(within(urgentes).getByRole('button', { name: 'Esta semana 1' }));
    expect(urgentes).toHaveTextContent('Tarea semana'); expect(urgentes).not.toHaveTextContent('Tarea hoy');
    expect(within(urgentes).getByRole('link', { name: 'Ver todas mis tareas' })).toHaveAttribute('href', '/tareas');
  });
  it('permite consultar las marcas fuera del top seis sin agruparlas como Otras', async () => {
    vi.mocked(dashboardApi.getDashboardTasks).mockResolvedValue(Array.from({ length: 8 }, (_, i) => tarea(`marca${i}`, 'backlog', { brand_id: `b${i}`, brands: { nombre: `Marca ${i}` } })));
    abrir(); await screen.findByTestId('marcas-barras');
    expect(within(screen.getByTestId('marcas-barras')).getAllByRole('button')).toHaveLength(6);
    fireEvent.click(screen.getByText('+2 marcas más · Ver todas'));
    fireEvent.click(screen.getByRole('button', { name: 'Ver tareas de Marca 7' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Tarea marca7');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Tarea marca0');
  });
});

const tarea = (id: string, estado: string, extra: Record<string, unknown> = {}) => ({
  id, titulo_tarea: `Tarea ${id}`, estado, fecha_entrega: '2026-10-10', prioridad: 'media',
  responsable_user_id: 'u1', brand_id: 'b1', desk_id: 'd1', cantidad_entregables: 2, tiempo_trabajado: 60,
  brands: { nombre: 'Dinatek' }, ...extra,
});
const tareas = [
  tarea('activa', 'en_proceso'), tarea('revision', 'en_revision'), tarea('aprobada', 'aprobado'), tarea('entregada', 'entregado'),
  tarea('atrasada', 'backlog', { fecha_entrega: '2026-09-30' }),
  tarea('cliente', 'revision_cliente', { fecha_entrega: '2026-09-30' }),
  tarea('otra', 'en_proceso', { responsable_user_id: 'u2', brand_id: 'b2', desk_id: 'd2', brands: { nombre: 'Pronaca' } }),
];

beforeEach(() => {
  localStorage.clear(); contexto.equipo = false; contexto.usuario = 'u1'; contexto.marca = null; contexto.mesa = null; navigate.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-02T15:00:00Z'));
  vi.mocked(dashboardApi.getDashboardTasks).mockReset().mockResolvedValue(tareas);
  vi.mocked(api.getProfiles).mockResolvedValue([{ id: 'u1', nombre: 'Even', activo: true }, { id: 'u2', nombre: 'Diego', activo: true }]);
  vi.mocked(api.getBrands).mockResolvedValue([{ id: 'b1', nombre: 'Dinatek', activo: true }, { id: 'b2', nombre: 'Pronaca', activo: true }]);
  vi.mocked(api.getDesks).mockResolvedValue([]); vi.mocked(api.getRecentActivity).mockResolvedValue([]);
  vi.mocked(api.apiRequest).mockResolvedValue({ ok: true, json: async () => dia } as Response);
  vi.mocked(api.getGoogleCalendarStatus).mockReset().mockResolvedValue({ connected: true, calendar: true });
  vi.mocked(api.getGoogleCalendarEvents).mockReset().mockResolvedValue({ events: reuniones });
  vi.mocked(api.getTeamLiveStatus).mockReset().mockResolvedValue({ users: [] });
});
afterEach(() => vi.useRealTimers());

function abrir() {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Dashboard /></MemoryRouter>);
}
function tarjeta(titulo: string) { return screen.getByText(titulo, { selector: 'p' }).closest('.glass-card') as HTMLElement; }

const dia = {
  ingreso: '2026-10-02T13:03:00Z', trabajadoSeg: 7500, jornadaSeg: 36000, focoSeg: 18000,
  inicio: '2026-10-02T13:00:00Z', fin: '2026-10-02T23:00:00Z', ahora: 20,
  segmentos: [{ tipo: 'tareas', desde: 0, hasta: 20 }, { tipo: 'pendiente', desde: 20, hasta: 100 }],
  reuniones: { total: 3, segundos: 10800, hechas: 1, enCurso: 1, porVenir: 1 },
  tareas: { completadas: 2, total: 4 }, cumplimiento: { porcentaje: 80, estado: 'Vas bien', delta: 10 },
};
const evento = (id: string, start: string, end: string) => ({ id, summary: id, start: `2026-10-02T${start}:00-05:00`, end: `2026-10-02T${end}:00-05:00`, htmlLink: `https://calendar.google.com/${id}`, es_reunion: true, enlace: { url: `https://meet.google.com/${id}`, plataforma: 'meet' } });
const reuniones = [evento('Terminada', '08:00', '09:00'), evento('Próxima', '11:00', '12:00'), evento('Actual', '09:00', '11:00'), { ...evento('[Tiusdei] tarea', '09:00', '11:00'), es_reunion: false }];

describe('Dashboard · Tu día, Reuniones y estado del equipo', () => {
  it.each([false, true])('muestra las mismas métricas personales con equipo=%s', async equipo => {
    contexto.equipo = equipo; abrir();
    const tarjeta = await screen.findByRole('region', { name: 'Tu día' });
    for (const texto of ['08:03', '2h 5m de 10h 0m', '3 hoy · 3h 0m', '1 hechas · 1 en curso · 1 por venir', '5h 0m', '2 de 4 completadas', '80%', 'Vas bien', '+10 pp']) expect(tarjeta).toHaveTextContent(texto);
    expect(api.apiRequest).toHaveBeenCalledWith('/api/data/mi-dia', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    if (equipo) expect(api.getTeamLiveStatus).not.toHaveBeenCalled();
  });
  it('pone Ahora primero, registra el ingreso real y colapsa terminadas sin enlaces', async () => {
    abrir(); const tarjeta = await screen.findByRole('region', { name: 'Reuniones' });
    await within(tarjeta).findByText('Actual');
    expect(within(tarjeta).getAllByRole('article').map(e => e.getAttribute('aria-label'))).toEqual(['Actual', 'Próxima']);
    expect(tarjeta).not.toHaveTextContent('[Tiusdei]');
    expect(within(tarjeta).getByText('Ahora')).toBeInTheDocument();
    const actual = within(tarjeta).getByRole('article', { name: 'Actual' });
    fireEvent.click(within(actual).getByRole('link', { name: 'Entrar a Meet' }));
    expect(actual).toHaveTextContent('Estás aquí · llevas 0 min');
    expect(within(actual).getByRole('link', { name: 'Volver a Meet' })).toHaveAttribute('href', 'https://meet.google.com/Actual');
    fireEvent.click(within(tarjeta).getByText('1 terminadas'));
    expect(within(within(tarjeta).getByRole('article', { name: 'Terminada' })).queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(within(tarjeta).getByRole('tab', { name: 'Semana' }));
    expect(await within(tarjeta).findByRole('grid', { name: 'Calendario de reuniones' })).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(tarjeta).getByRole('tab', { name: 'Mes' })); });
    expect(within(tarjeta).getByRole('tab', { name: 'Mes' })).toHaveAttribute('aria-selected', 'true');
  });
  it('ofrece un aviso no invasivo y Ahora no lo oculta exactamente siete días', async () => {
    vi.mocked(api.getGoogleCalendarStatus).mockResolvedValue({ connected: false });
    const vista = abrir();
    expect(await screen.findByText('Conecta tu Google Calendar para ver tus reuniones aquí')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Conectar' })).toHaveAttribute('href', expect.stringContaining('/api/auth/google?mode=connect'));
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }));
    expect(localStorage.getItem('tiusdei:calendar:aviso-oculto-hasta')).toBe(String(Date.now() + 7 * 86400000));
    expect(screen.queryByText('Conecta tu Google Calendar para ver tus reuniones aquí')).not.toBeInTheDocument();
    vista.unmount(); vi.setSystemTime(new Date('2026-10-09T15:00:00Z')); abrir();
    expect(await screen.findByText('Conecta tu Google Calendar para ver tus reuniones aquí')).toBeInTheDocument();
    expect(api.getGoogleCalendarEvents).not.toHaveBeenCalled();
  });
  it('distingue falta de permiso de falta de conexión', async () => {
    vi.mocked(api.getGoogleCalendarStatus).mockResolvedValue({ connected: true, calendar: false }); abrir();
    expect(await screen.findByText('Falta el permiso de Google Calendar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dar permiso' })).toBeInTheDocument();
    expect(api.getGoogleCalendarEvents).not.toHaveBeenCalled();
  });
  it('limita el refetch por foco, actualiza el monitor cada minuto y limpia los intervalos', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ now: new Date('2026-10-02T15:00:00Z') });
    let vista!: ReturnType<typeof abrir>;
    await act(async () => { vista = abrir(); });
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(59999); window.dispatchEvent(new Event('focus')); });
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); window.dispatchEvent(new Event('focus')); });
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(2);
    expect(api.getTeamLiveStatus).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(240000); });
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(3);
    vista.unmount(); const consultas = vi.mocked(api.getTeamLiveStatus).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(300000); window.dispatchEvent(new Event('focus')); });
    expect(api.getTeamLiveStatus).toHaveBeenCalledTimes(consultas);
    expect(api.getGoogleCalendarEvents).toHaveBeenCalledTimes(3);
  });
  it('omite los estados si falla el monitor sin impedir el dashboard', async () => {
    vi.mocked(api.getTeamLiveStatus).mockRejectedValue(new Error('Sin acceso')); abrir();
    expect(await screen.findByText('Métricas por Responsable')).toBeInTheDocument();
    expect(screen.queryByText('Sin ingreso hoy')).not.toBeInTheDocument();
    expect(screen.queryByText(/Trabajando ·/)).not.toBeInTheDocument();
  });
  it('agrega los tres estados debajo de las completadas', async () => {
    vi.mocked(dashboardApi.getDashboardTasks).mockResolvedValue([...tareas, tarea('tercera', 'backlog', { responsable_user_id: 'u3' })]);
    vi.mocked(api.getProfiles).mockResolvedValue([{ id: 'u1', nombre: 'Even' }, { id: 'u2', nombre: 'Diego' }, { id: 'u3', nombre: 'Ana' }]);
    vi.mocked(api.getTeamLiveStatus).mockResolvedValue({ users: [
      { user_id: 'u1', session_status: 'active', titulo_tarea: 'Diseño' },
      { user_id: 'u2', meeting_now: { summary: 'Planificación' } }, { user_id: 'u3', first_check_in: null },
    ] }); abrir();
    for (const texto of ['Trabajando · Diseño', 'En reunión · Planificación', 'Sin ingreso hoy']) expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(api.getTeamLiveStatus).toHaveBeenCalledTimes(1);
  });
});

describe('Dashboard · comportamiento anterior a la extracción', () => {
  it('mantiene los conteos de tarjetas y los grupos de las barras', async () => {
    abrir(); await screen.findByText('Tareas Activas');
    expect(tarjeta('Tareas Activas')).toHaveTextContent('3');
    expect(tarjeta('En Revisión')).toHaveTextContent('1');
    expect(tarjeta('Entregadas')).toHaveTextContent('1');
    expect(tarjeta('Atrasadas')).toHaveTextContent('1');
    expect(tarjeta('Total Entregables')).toHaveTextContent('14');
    expect(tarjeta('Tiempo Total')).toHaveTextContent('7m');
    const barras = JSON.parse(screen.getByTestId('barras').querySelector('pre')!.textContent!);
    expect(barras).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'Even', total: 6, completadas: 2, enProgreso: 2 })]));
  });

  it('aplica marca, mesa y período antes de calcular el dashboard', async () => {
    contexto.marca = 'b1'; contexto.mesa = 'd1';
    localStorage.setItem('dashboard_periodo', 'custom');
    localStorage.setItem('dashboard_periodo_desde', '2026-10-01'); localStorage.setItem('dashboard_periodo_hasta', '2026-10-31');
    abrir(); await screen.findByText('Tareas Activas');
    expect(tarjeta('Tareas Activas')).toHaveTextContent('2');
    expect(tarjeta('Atrasadas')).toHaveTextContent('0');
    expect(tarjeta('Total Entregables')).toHaveTextContent('8');
    expect(screen.getByTestId('barras')).not.toHaveTextContent('Diego');
    expect(screen.getByTestId('marcas-barras')).not.toHaveTextContent('Pronaca');
  });

  it('el equipo solo cuenta sus tareas y conserva sus gráficos personales', async () => {
    contexto.equipo = true; abrir(); await screen.findByText('Mis Tareas Activas');
    expect(tarjeta('Mis Tareas Activas')).toHaveTextContent('2');
    expect(tarjeta('Mis Entregables')).toHaveTextContent('12');
    expect(screen.getByText('Mis Tareas por Estado')).toBeInTheDocument();
    expect(screen.queryByText('Tareas por Responsable')).not.toBeInTheDocument();
    expect(screen.getByTestId('marcas-barras')).not.toHaveTextContent('Pronaca');
  });

  it('ya abre una tarea urgente por su identificador', async () => {
    abrir(); const titulo = await screen.findByText('Tarea atrasada');
    fireEvent.click(titulo); expect(navigate).toHaveBeenCalledWith('/tareas?task=atrasada');
  });
});
