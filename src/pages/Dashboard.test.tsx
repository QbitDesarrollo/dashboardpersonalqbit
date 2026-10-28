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
});
afterEach(() => vi.useRealTimers());

function abrir() {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Dashboard /></MemoryRouter>);
}
function tarjeta(titulo: string) { return screen.getByText(titulo, { selector: 'p' }).closest('.glass-card') as HTMLElement; }

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
