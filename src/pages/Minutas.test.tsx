import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Minutas from './Minutas';
import * as minutasApi from '@/lib/minutasApi';
import * as minutasIa from '@/lib/minutasIaApi';

vi.mock('@/lib/minutasApi', () => ({ listarMinutas: vi.fn() }));
vi.mock('@/lib/minutasIaApi', () => ({ estadoIa: vi.fn(async () => ({ permitido: false, disponible: false, detalle: null, usados: 0, limite: 10 })) }));
vi.mock('@/lib/apiClient', () => ({
  getBrands: vi.fn(async () => [{ id: 'b1', nombre: 'Dinatek', activo: 1 }, { id: 'b2', nombre: 'Alba del Bosque', activo: 1 }]),
  getProjects: vi.fn(async () => [{ id: 'p1', nombre: 'Asistente Proyecta · Bot' }]),
}));

const minuta = {
  id: 'm3', brand_id: 'b1', brand_nombre: 'Dinatek', project_id: 'p9', project_nombre: 'Rediseño del sitio web Dinatek',
  numero: 3, codigo: 'M-03', titulo: 'Revisión de avance: home y catálogo', fecha: '2026-09-22', estado: 'publicada',
  owner: { id: 'u1', nombre: 'Even' }, progreso: { total: 4, cerrados: 1, enCurso: 2 },
};

const futuro = { v7_startTransition: true, v7_relativeSplatPath: true };

describe('Minutas (lista)', () => {
  beforeEach(() => { vi.mocked(minutasApi.listarMinutas).mockReset(); });

  it('muestra cada minuta con código, marca, proyecto, fecha, avance y enlace al detalle', async () => {
    vi.mocked(minutasApi.listarMinutas).mockResolvedValue([minuta] as never);
    render(<MemoryRouter future={futuro}><Minutas /></MemoryRouter>);
    const fila = await screen.findByRole('link', { name: /Revisión de avance: home y catálogo/ });
    expect(fila).toHaveAttribute('href', '/minutas/m3');
    expect(fila).toHaveTextContent('M-03');
    expect(fila).toHaveTextContent('Dinatek · Rediseño del sitio web · 22 sep 2026');
    expect(fila).toHaveTextContent('1 de 4 puntos cerrados');
    expect(fila).toHaveTextContent('Publicada');
  });

  it('filtra por marca', async () => {
    vi.mocked(minutasApi.listarMinutas).mockResolvedValue([] as never);
    render(<MemoryRouter future={futuro}><Minutas /></MemoryRouter>);
    await screen.findByRole('option', { name: 'Alba del Bosque' });
    fireEvent.change(screen.getByLabelText('Marca'), { target: { value: 'b2' } });
    await waitFor(() => expect(minutasApi.listarMinutas).toHaveBeenLastCalledWith({ brand_id: 'b2', project_id: '', q: '' }));
  });

  it('busca por texto', async () => {
    vi.mocked(minutasApi.listarMinutas).mockResolvedValue([] as never);
    render(<MemoryRouter future={futuro}><Minutas /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: ' whatsapp ' } });
    await waitFor(() => expect(minutasApi.listarMinutas).toHaveBeenLastCalledWith({ brand_id: '', project_id: '', q: 'whatsapp' }));
  });

  it('muestra cuántas minutas con IA te quedan hoy si tu mesa puede usarla', async () => {
    vi.mocked(minutasApi.listarMinutas).mockResolvedValue([] as never);
    vi.mocked(minutasIa.estadoIa).mockResolvedValueOnce({ permitido: true, disponible: true, detalle: 'ok', usados: 3, limite: 10 });
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Minutas /></MemoryRouter>);
    expect(await screen.findByText('Te quedan 7 de 10 minutas con IA hoy')).toBeInTheDocument();
  });

  it('sin acceso a la IA no muestra el contador', async () => {
    vi.mocked(minutasApi.listarMinutas).mockResolvedValue([] as never);
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Minutas /></MemoryRouter>);
    await waitFor(() => expect(minutasIa.estadoIa).toHaveBeenCalled());
    expect(screen.queryByText(/minutas con IA/)).not.toBeInTheDocument();
  });

  it('sin marca elegida, el filtro de proyecto dice "Todos los proyectos" y está desactivado', async () => {
    vi.mocked(minutasApi.listarMinutas).mockResolvedValue([] as never);
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Minutas /></MemoryRouter>);
    const proyecto = await screen.findByRole('combobox', { name: 'Proyecto' });
    expect(proyecto).toBeDisabled();
    expect(proyecto).toHaveDisplayValue('Todos los proyectos');
  });
});
