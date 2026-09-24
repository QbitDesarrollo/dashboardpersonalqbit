import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MinutaDetalle from './MinutaDetalle';
import * as minutasApi from '@/lib/minutasApi';
import type { Minuta, Punto } from '@/lib/minutasApi';

vi.mock('@/lib/minutasApi', () => ({ obtenerMinuta: vi.fn(), agregarPunto: vi.fn(), editarMinuta: vi.fn(), borrarMinuta: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ getProfiles: vi.fn(async () => []) }));
vi.mock('@/components/minutas/PuntoDialog', () => ({
  PuntoDialog: ({ punto, abierto }: { punto: Punto; abierto: boolean }) => (abierto ? <div role="dialog">Diálogo de {punto.titulo}</div> : null),
}));
vi.mock('@/lib/minutas', async (orig) => ({ ...(await orig<typeof import('@/lib/minutas')>()), hoyEcuador: () => '2026-09-24' }));

const punto = (p: Partial<Punto>): Punto => ({
  id: 'i1', numero: 1, titulo: 'Filtro por marca', descripcion: 'Sobre todo en celular', responsable: { id: 'u2', nombre: 'Diego Ruiz' },
  responsable_cliente: false, fecha_compromiso: '2026-09-19', estado: 'en_curso', visible_cliente: true, resolucion: null,
  completado_por: null, completado_en: null, aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null,
  motivo_descarte: null, evidencias: [], tareas: [], ...p,
});

const minuta: Minuta = {
  id: 'm3', brand_id: 'b1', brand_nombre: 'Dinatek', project_id: 'p1', project_nombre: 'Rediseño del sitio web Dinatek',
  numero: 3, codigo: 'M-03', titulo: 'Revisión de avance: home y catálogo', fecha: '2026-09-22', estado: 'borrador',
  owner: { id: 'u1', nombre: 'Even' }, miembros: [{ id: 'u2', nombre: 'Diego Ruiz' }], resumen: 'Acuerdo: lanzamiento el 26 de noviembre.',
  progreso: { total: 2, cerrados: 0, enCurso: 1 },
  items: [punto({}), punto({ id: 'i2', numero: 2, titulo: 'Fichas técnicas', responsable: null, responsable_cliente: true, estado: 'pendiente', fecha_compromiso: null, descripcion: null })],
};

function renderDetalle() {
  render(
    <MemoryRouter initialEntries={['/minutas/m3']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/minutas/:id" element={<MinutaDetalle />} /></Routes>
    </MemoryRouter>,
  );
}

describe('MinutaDetalle', () => {
  beforeEach(() => {
    vi.mocked(minutasApi.obtenerMinuta).mockReset().mockResolvedValue(minuta);
    vi.mocked(minutasApi.agregarPunto).mockReset();
    vi.mocked(minutasApi.editarMinuta).mockReset();
  });

  it('muestra la minuta con sus puntos y abre el punto al tocarlo', async () => {
    renderDetalle();
    expect(await screen.findByRole('heading', { name: 'Revisión de avance: home y catálogo' })).toBeInTheDocument();
    expect(screen.getByText(/Dinatek · M-03 · 22 sep 2026/)).toBeInTheDocument();
    expect(screen.getByText('Acuerdo: lanzamiento el 26 de noviembre.')).toBeInTheDocument();
    const fila = screen.getByRole('button', { name: /3\.1 Filtro por marca/ });
    expect(fila).toHaveTextContent('En curso');
    expect(fila).toHaveTextContent('Vencido hace 5 días');
    expect(screen.getByRole('button', { name: /3\.2 Fichas técnicas/ })).toHaveTextContent('Esperando al cliente');
    fireEvent.click(fila);
    expect(screen.getByRole('dialog')).toHaveTextContent('Diálogo de Filtro por marca');
  });

  it('agrega un punto con Enter', async () => {
    vi.mocked(minutasApi.agregarPunto).mockResolvedValue({ ...minuta, items: [...minuta.items, punto({ id: 'i3', numero: 3, titulo: 'Botón de WhatsApp', estado: 'pendiente' })] });
    renderDetalle();
    const campo = await screen.findByPlaceholderText('Agregar un punto y presionar Enter');
    fireEvent.change(campo, { target: { value: 'Botón de WhatsApp' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(minutasApi.agregarPunto).toHaveBeenCalledWith('m3', { titulo: 'Botón de WhatsApp' }));
    expect(await screen.findByRole('button', { name: /3\.3 Botón de WhatsApp/ })).toBeInTheDocument();
  });

  it('publica una minuta en borrador', async () => {
    vi.mocked(minutasApi.editarMinuta).mockResolvedValue({ ...minuta, estado: 'publicada' });
    renderDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(minutasApi.editarMinuta).toHaveBeenCalledWith('m3', { estado: 'publicada' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument());
  });
});
