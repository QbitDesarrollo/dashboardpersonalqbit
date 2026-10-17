import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import type { Project } from '@/lib/apiClient';
import { DetalleProyecto } from './DetalleProyecto';

vi.mock('@/lib/apiClient', () => ({ getProject: vi.fn(), patchProject: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./ReportesProyecto', () => ({ ReportesProyecto: ({ reporteInicial }: { reporteInicial?: string }) => <p>Sección de reportes {reporteInicial}</p> }));
let auth = { profile: { id: 'u9', rol: 'equipo' }, isAdmin: false, isEjecutivo: false };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const m = vi.mocked(api);
const PERSONAS = [{ id: 'u1', nombre: 'Even Fierro' }, { id: 'u2', nombre: 'Ana Mora' }];
const proyecto = (p: Partial<Project>): Project => ({
  id: 'p1', brand_id: 'b1', brand_nombre: 'Alba del Bosque', nombre: 'Bot Proyecta', descripcion: null, estado: 'en_curso', salud: 'verde', salud_manual: false,
  fecha_inicio: null, fecha_fin: null, lider_user_id: 'u1', lider_nombre: 'Even Fierro', desk_id: null, color: null, activo: true,
  total_tareas: 0, tareas_listas: 0, vencidas: 0, avance: 0, created_at: '2026-09-01', ...p,
});

beforeEach(() => { vi.clearAllMocks(); });
const mostrar = (p: Project, reporteInicial?: string) => {
  m.getProject.mockResolvedValue({ project: p, tasks: [] });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DetalleProyecto project={p} personas={PERSONAS} onBack={() => {}} reporteInicial={reporteInicial} /></MemoryRouter>);
};

describe('DetalleProyecto', () => {
  it('sin líder avisa, y admin o ejecutivo lo asignan ahí mismo', async () => {
    auth = { profile: { id: 'u9', rol: 'ejecutivo' }, isAdmin: false, isEjecutivo: true };
    m.patchProject.mockResolvedValue(proyecto({ lider_user_id: 'u2', lider_nombre: 'Ana Mora' }));
    mostrar(proyecto({ lider_user_id: null, lider_nombre: null }));
    expect(await screen.findByText('Este proyecto no tiene líder. Asígnalo para activar sus reportes semanales.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Líder del proyecto'), { target: { value: 'u2' } });
    await waitFor(() => expect(m.patchProject).toHaveBeenCalledWith('p1', { lider_user_id: 'u2' }));
    expect(toast.success).toHaveBeenCalledWith('Líder actualizado');
  });

  it('"Ver en Tareas" lleva a Tareas filtrado por la marca y el proyecto', async () => {
    mostrar(proyecto({}));
    expect(await screen.findByRole('link', { name: 'Ver en Tareas' })).toHaveAttribute('href', '/tareas?brand=b1&project=p1');
  });

  it('el líder ve la sección de reportes, pero no cambia el líder', async () => {
    auth = { profile: { id: 'u1', rol: 'equipo' }, isAdmin: false, isEjecutivo: false };
    mostrar(proyecto({}), 'r5');
    expect(await screen.findByText('Sección de reportes r5')).toBeInTheDocument();
    expect(screen.queryByLabelText('Líder del proyecto')).not.toBeInTheDocument();
  });

  it('quien no es líder ni admin no ve los reportes', async () => {
    auth = { profile: { id: 'u9', rol: 'equipo' }, isAdmin: false, isEjecutivo: false };
    mostrar(proyecto({}));
    await screen.findByText('Tareas del proyecto');
    expect(screen.queryByText(/Sección de reportes/)).not.toBeInTheDocument();
  });

  it('con el líder desactivado lo trata como sin líder: avisa y no muestra reportes', async () => {
    auth = { profile: { id: 'u9', rol: 'admin' }, isAdmin: true, isEjecutivo: false };
    mostrar(proyecto({ lider_activo: false, lider_nombre: 'Ex compañera', lider_user_id: 'x1' }));
    expect(await screen.findByText('El líder de este proyecto está desactivado. Asigna otro para seguir con sus reportes.')).toBeInTheDocument();
    expect(screen.queryByText(/Sección de reportes/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Líder del proyecto')).toHaveValue('');
  });

  it('con líder muestra su nombre y el selector solo aparece al tocar "Cambiar"', async () => {
    auth = { profile: { id: 'u9', rol: 'admin' }, isAdmin: true, isEjecutivo: false };
    m.patchProject.mockResolvedValue(proyecto({ lider_user_id: 'u2', lider_nombre: 'Ana Mora' }));
    mostrar(proyecto({}));
    expect(await screen.findByText('Líder: Even Fierro')).toBeInTheDocument();
    expect(screen.queryByLabelText('Líder del proyecto')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar líder' }));
    fireEvent.change(screen.getByLabelText('Líder del proyecto'), { target: { value: 'u2' } });
    await waitFor(() => expect(m.patchProject).toHaveBeenCalledWith('p1', { lider_user_id: 'u2' }));
    expect(await screen.findByText('Líder: Ana Mora')).toBeInTheDocument();
  });
});

