import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MinutaNueva from './MinutaNueva';
import * as minutasApi from '@/lib/minutasApi';
import * as minutasIa from '@/lib/minutasIaApi';
import type { BorradorIa } from '@/lib/minutasIaApi';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-even', nombre: 'Even', email: 'even@qbit.com.ec' } }) }));
vi.mock('@/lib/minutasApi', () => ({ crearMinuta: vi.fn() }));
vi.mock('@/lib/minutasIaApi', () => ({
  estadoIa: vi.fn(async () => ({ permitido: false, disponible: false, detalle: null, usados: 0, limite: 10 })),
  pedirBorrador: vi.fn(async () => ({ id: 'job1' })),
  esperarBorrador: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/apiClient', () => ({
  getBrands: vi.fn(async () => [{ id: 'b1', nombre: 'Dinatek', activo: 1 }, { id: 'b2', nombre: 'Alba del Bosque', activo: 1 }]),
  getProjects: vi.fn(async () => [{ id: 'p1', nombre: 'Rediseño del sitio web Dinatek' }]),
  getProfiles: vi.fn(async () => [{ id: 'u-even', nombre: 'Even', activo: 1 }, { id: 'u-diego', nombre: 'Diego Ruiz', activo: 1 }]),
}));
vi.mock('@/lib/minutas', async (orig) => ({ ...(await orig<typeof import('@/lib/minutas')>()), hoyEcuador: () => '2026-09-24' }));

describe('MinutaNueva', () => {
  beforeEach(() => { navigate.mockReset(); vi.mocked(minutasApi.crearMinuta).mockReset(); vi.mocked(minutasIa.estadoIa).mockClear(); });

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

  describe('con IA', () => {
    const BORRADOR: BorradorIa = {
      titulo: 'Revisión de avance: home', resumen: 'Lanzamiento el 26 de noviembre.',
      puntos: [
        { titulo: 'Video en el home', descripcion: 'Sin sonido.', responsable_cliente: false, origen: 'reunion', fecha_compromiso: '2026-10-03', cita: 'que no suene', cita_fuente: 'reunion', tareas_sugeridas: [] },
        { titulo: 'Fichas técnicas', descripcion: '', responsable_cliente: true, origen: 'ambos', fecha_compromiso: null, cita: 'te las mando el lunes', cita_fuente: 'reunion', tareas_sugeridas: [] },
      ],
    };
    const renderNueva = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MinutaNueva /></MemoryRouter>);

    it('no ofrece la IA a quien no es de una mesa habilitada', async () => {
      renderNueva();
      await waitFor(() => expect(minutasIa.estadoIa).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: 'Generar con IA' })).not.toBeInTheDocument();
    });

    it('llena título, resumen y puntos con el borrador para revisarlos', async () => {
      vi.mocked(minutasIa.estadoIa).mockResolvedValueOnce({ permitido: true, disponible: true, detalle: 'ok', usados: 0, limite: 10 });
      vi.mocked(minutasIa.esperarBorrador).mockResolvedValue(BORRADOR);
      renderNueva();
      fireEvent.click(await screen.findByRole('button', { name: 'Generar con IA' }));
      fireEvent.change(screen.getByLabelText('Transcripción de la reunión'), { target: { value: 'Even: revisamos el home.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));

      await waitFor(() => expect(screen.getByLabelText('Título')).toHaveValue('Revisión de avance: home'));
      expect(minutasIa.pedirBorrador).toHaveBeenCalledWith({ transcripcion: 'Even: revisamos el home.', notas_cliente: '', indicaciones: '', fecha: '2026-09-24' });
      expect(screen.getByLabelText('Resumen y acuerdos')).toHaveValue('Lanzamiento el 26 de noviembre.');
      expect(screen.getByLabelText('Título del punto 1')).toHaveValue('Video en el home');
      expect(screen.getByLabelText('Fecha del punto 1')).toHaveValue('2026-10-03');
      expect(screen.getByLabelText('Responsable del punto 2')).toHaveValue('cliente');
      expect(screen.getByText('«te las mando el lunes»')).toBeInTheDocument();
      await waitFor(() => expect(minutasIa.estadoIa).toHaveBeenCalledTimes(2));
    });

    it('muestra junto al botón cuántas quedan hoy y lo actualiza al generar', async () => {
      vi.mocked(minutasIa.estadoIa)
        .mockResolvedValueOnce({ permitido: true, disponible: true, detalle: 'ok', usados: 4, limite: 10 })
        .mockResolvedValueOnce({ permitido: true, disponible: true, detalle: 'ok', usados: 5, limite: 10 });
      vi.mocked(minutasIa.esperarBorrador).mockResolvedValue(BORRADOR);
      renderNueva();
      expect(await screen.findByText('Te quedan 6 de 10 minutas con IA hoy')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Generar con IA' }));
      fireEvent.change(screen.getByLabelText('Transcripción de la reunión'), { target: { value: 'Hola' } });
      fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));
      expect(await screen.findByText('Te quedan 5 de 10 minutas con IA hoy')).toBeInTheDocument();
    });

    it('no pisa lo que ya escribiste: los puntos se agregan al final', async () => {
      vi.mocked(minutasIa.estadoIa).mockResolvedValueOnce({ permitido: true, disponible: true, detalle: 'ok', usados: 0, limite: 10 });
      vi.mocked(minutasIa.esperarBorrador).mockResolvedValue(BORRADOR);
      renderNueva();
      fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Mi título' } });
      fireEvent.change(screen.getByLabelText('Resumen y acuerdos'), { target: { value: 'Mis notas.' } });
      const captura = screen.getByPlaceholderText('Escribe un punto y presiona Enter');
      fireEvent.change(captura, { target: { value: 'Punto mío' } });
      fireEvent.keyDown(captura, { key: 'Enter' });
      fireEvent.click(await screen.findByRole('button', { name: 'Generar con IA' }));
      fireEvent.change(screen.getByLabelText('Transcripción de la reunión'), { target: { value: 'Hola' } });
      fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));

      await waitFor(() => expect(screen.getByLabelText('Título del punto 3')).toHaveValue('Fichas técnicas'));
      expect(screen.getByLabelText('Título')).toHaveValue('Mi título');
      expect(screen.getByLabelText('Resumen y acuerdos')).toHaveValue('Mis notas.\n\nLanzamiento el 26 de noviembre.');
      expect(screen.getByLabelText('Título del punto 1')).toHaveValue('Punto mío');
    });
  });
});
