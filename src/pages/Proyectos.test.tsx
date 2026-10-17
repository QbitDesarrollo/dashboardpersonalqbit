import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import type { Project } from '@/lib/apiClient';
import Proyectos from './Proyectos';

vi.mock('@/lib/apiClient', () => ({ getProjects: vi.fn(), getBrands: vi.fn(), getProfiles: vi.fn(), deleteProject: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/proyectos/DetalleProyecto', () => ({
  DetalleProyecto: ({ project, reporteInicial }: { project: Project; reporteInicial?: string }) => <p>Detalle de {project.nombre} · reporte {reporteInicial ?? 'ninguno'}</p>,
}));

const m = vi.mocked(api);
const proyecto = (p: Partial<Project>): Project => ({
  id: 'p1', brand_id: 'b1', brand_nombre: 'Alba del Bosque', nombre: 'Bot Proyecta', descripcion: null, estado: 'en_curso', salud: 'verde', salud_manual: false,
  fecha_inicio: null, fecha_fin: null, lider_user_id: 'u1', lider_nombre: 'Even Fierro', desk_id: null, color: null, activo: true,
  total_tareas: 0, tareas_listas: 0, vencidas: 0, avance: 0, created_at: '2026-09-01', ...p,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.getBrands.mockResolvedValue([]);
  m.getProfiles.mockResolvedValue([{ id: 'u1', nombre: 'Even Fierro', rol: 'admin' }, { id: 'c1', nombre: 'Cliente', rol: 'cliente' }] as never);
});

const mostrar = (ruta = '/proyectos') => render(<MemoryRouter initialEntries={[ruta]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Proyectos /></MemoryRouter>);

describe('Proyectos', () => {
  it('marca los proyectos que no tienen líder', async () => {
    m.getProjects.mockResolvedValue([
      proyecto({}), proyecto({ id: 'p2', nombre: 'Portal', lider_user_id: null, lider_nombre: null }),
      proyecto({ id: 'p3', nombre: 'SEO', lider_user_id: 'x1', lider_nombre: 'Ex compañera', lider_activo: false }),
    ]);
    mostrar();
    expect(await screen.findByText('Portal')).toBeInTheDocument();
    expect(screen.getAllByText('Sin líder')).toHaveLength(1);
    expect(screen.getByText('Líder desactivado')).toBeInTheDocument();
  });

  it('el enlace del correo abre el proyecto y el reporte', async () => {
    m.getProjects.mockResolvedValue([proyecto({})]);
    mostrar('/proyectos?proyecto=p1&reporte=r5');
    expect(await screen.findByText('Detalle de Bot Proyecta · reporte r5')).toBeInTheDocument();
  });

  it('muestra la descripción del proyecto, recortada', async () => {
    m.getProjects.mockResolvedValue([proyecto({ descripcion: 'Bot de WhatsApp que atiende a los clientes de Alba del Bosque y agenda visitas.' })]);
    mostrar();
    const desc = await screen.findByText('Bot de WhatsApp que atiende a los clientes de Alba del Bosque y agenda visitas.');
    expect(desc).toHaveClass('line-clamp-2');
  });
});

