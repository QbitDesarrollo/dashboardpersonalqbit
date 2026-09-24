import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MinutaNueva from './MinutaNueva';
import * as minutasApi from '@/lib/minutasApi';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-even', nombre: 'Even', email: 'even@qbit.com.ec' } }) }));
vi.mock('@/lib/minutasApi', () => ({ crearMinuta: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({
  getBrands: vi.fn(async () => [{ id: 'b1', nombre: 'Dinatek', activo: 1 }, { id: 'b2', nombre: 'Alba del Bosque', activo: 1 }]),
  getProjects: vi.fn(async () => [{ id: 'p1', nombre: 'Rediseño del sitio web Dinatek' }]),
  getProfiles: vi.fn(async () => [{ id: 'u-even', nombre: 'Even', activo: 1 }, { id: 'u-diego', nombre: 'Diego Ruiz', activo: 1 }]),
}));
vi.mock('@/lib/minutas', async (orig) => ({ ...(await orig<typeof import('@/lib/minutas')>()), hoyEcuador: () => '2026-09-24' }));

describe('MinutaNueva', () => {
  beforeEach(() => { navigate.mockReset(); vi.mocked(minutasApi.crearMinuta).mockReset(); });

  it('publica la minuta con sus puntos y abre el detalle', async () => {
    vi.mocked(minutasApi.crearMinuta).mockResolvedValue({ id: 'm1' } as never);
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MinutaNueva /></MemoryRouter>);

    const publicar = screen.getByRole('button', { name: 'Guardar y publicar' });
    expect(publicar).toBeDisabled();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Dinatek' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Marca'), { target: { value: 'b1' } });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Revisión de avance' } });
    const captura = screen.getByPlaceholderText('Escribe un punto y presiona Enter');
    fireEvent.change(captura, { target: { value: 'Filtro por marca' } });
    fireEvent.keyDown(captura, { key: 'Enter' });

    expect(publicar).toBeEnabled();
    fireEvent.click(publicar);

    await waitFor(() => expect(minutasApi.crearMinuta).toHaveBeenCalledWith({
      brand_id: 'b1',
      project_id: null,
      fecha: '2026-09-24',
      titulo: 'Revisión de avance',
      owner_user_id: 'u-even',
      miembros: [],
      resumen: null,
      estado: 'publicada',
      items: [{ titulo: 'Filtro por marca', descripcion: null, responsable_user_id: null, responsable_cliente: false, fecha_compromiso: null }],
    }));
    expect(navigate).toHaveBeenCalledWith('/minutas/m1');
  });

  it('guarda como borrador con proyecto, equipo y resumen', async () => {
    vi.mocked(minutasApi.crearMinuta).mockResolvedValue({ id: 'm2' } as never);
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MinutaNueva /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Dinatek' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Marca'), { target: { value: 'b1' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Rediseño del sitio web Dinatek' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Proyecto'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Kickoff' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Diego Ruiz' }));
    fireEvent.change(screen.getByLabelText('Resumen y acuerdos'), { target: { value: 'Revisiones los lunes.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(minutasApi.crearMinuta).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'p1', miembros: ['u-diego'], resumen: 'Revisiones los lunes.', estado: 'borrador',
    })));
  });
});
