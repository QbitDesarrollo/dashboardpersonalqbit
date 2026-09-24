import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Minutas from './Minutas';
import * as minutasApi from '@/lib/minutasApi';

vi.mock('@/lib/minutasApi', () => ({ listarMinutas: vi.fn() }));
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
});
