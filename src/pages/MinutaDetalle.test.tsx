import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import { toast } from 'sonner';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));
import MinutaDetalle from './MinutaDetalle';
import * as minutasApi from '@/lib/minutasApi';
import * as minutaPdf from '@/lib/minutaPdf';
import * as apiClient from '@/lib/apiClient';
import type { Minuta, Punto } from '@/lib/minutasApi';

vi.mock('@/lib/minutasApi', () => ({
  obtenerMinuta: vi.fn(), agregarPunto: vi.fn(), editarMinuta: vi.fn(), borrarMinuta: vi.fn(), reordenarPuntos: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// jsdom cannot measure positions: the drop is simulated through the list's onDragEnd.
let soltar: ((e: DragEndEvent) => void) | undefined;
vi.mock('@dnd-kit/core', async (orig) => {
  const real = await orig<typeof import('@dnd-kit/core')>();
  return { ...real, DndContext: (props: { onDragEnd?: (e: DragEndEvent) => void; children: React.ReactNode }) => { soltar = props.onDragEnd; return <>{props.children}</>; } };
});
vi.mock('@/lib/minutaPdf', () => ({ exportarMinutaPdf: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ getProfiles: vi.fn(async () => []), getProjects: vi.fn(async () => [{ id: 'p1', nombre: 'Rediseño del sitio web Dinatek' }]) }));
vi.mock('@/components/minutas/PuntoDialog', () => ({
  PuntoDialog: ({ punto, abierto, vista }: { punto: Punto; abierto: boolean; vista: string }) => (abierto ? <div role="dialog">{vista}: {punto.titulo}</div> : null),
}));
vi.mock('@/components/minutas/enlace/EnlaceCliente', () => ({
  EnlaceCliente: ({ onEnviar }: { onEnviar: () => void }) => <button onClick={onEnviar}>Enviar desde la tarjeta</button>,
}));
vi.mock('@/components/minutas/enlace/EnviarAlClienteDialog', () => ({
  EnviarAlClienteDialog: ({ abierto }: { abierto: boolean }) => (abierto ? <div role="dialog">Diálogo de envío</div> : null),
}));
vi.mock('@/lib/minutas', async (orig) => ({ ...(await orig<typeof import('@/lib/minutas')>()), hoyEcuador: () => '2026-09-24' }));

const punto = (p: Partial<Punto>): Punto => ({
  id: 'i1', numero: 1, titulo: 'Filtro por marca', descripcion: 'Sobre todo en celular', responsable: { id: 'u2', nombre: 'Diego Ruiz' },
  responsable_cliente: false, fecha_compromiso: '2026-09-19', estado: 'en_curso', visible_cliente: true, resolucion: null,
  completado_por: null, completado_en: null, aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null,
  motivo_descarte: null, evidencias: [], tareas: [], notas: [], ...p,
});

const minuta: Minuta = {
  id: 'm3', brand_id: 'b1', brand_nombre: 'Dinatek', project_id: 'p1', project_nombre: 'Rediseño del sitio web Dinatek',
  numero: 3, codigo: 'M-03', titulo: 'Revisión de avance: home y catálogo', fecha: '2026-09-22', estado: 'borrador',
  owner: { id: 'u1', nombre: 'Even' }, miembros: [{ id: 'u2', nombre: 'Diego Ruiz' }], resumen: 'Acuerdo: lanzamiento el 26 de noviembre.',
  progreso: { total: 2, cerrados: 0, enCurso: 1 },
  items: [punto({ notas: [
    { id: 'n1', tipo: 'nota', texto: 'Le gusta, pero quiere ver la versión en azul.', created_at: '2026-09-24T15:00:00.000Z', autor: { id: 'u1', nombre: 'Even' } },
    { id: 'n2', tipo: 'ajuste', texto: 'Que el filtro recuerde la última marca.', created_at: '2026-09-24T15:05:00.000Z', autor: { id: 'u1', nombre: 'Even' } },
  ] }), punto({ id: 'i2', numero: 2, titulo: 'Fichas técnicas', responsable: null, responsable_cliente: true, estado: 'pendiente', fecha_compromiso: null, descripcion: null })],
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

  it('muestra la minuta y cada punto con su descripción completa, para leer de corrido', async () => {
    renderDetalle();
    expect(await screen.findByRole('heading', { name: 'Revisión de avance: home y catálogo' })).toBeInTheDocument();
    expect(screen.getByText(/Dinatek · M-03 · 22 sep 2026/)).toBeInTheDocument();
    expect(screen.getByText('Acuerdo: lanzamiento el 26 de noviembre.')).toBeInTheDocument();
    const punto = screen.getByRole('listitem', { name: 'Punto 3.1' });
    expect(punto).toHaveTextContent('Filtro por marca');
    expect(punto).toHaveTextContent('Sobre todo en celular');
    expect(punto).toHaveTextContent('En curso');
    expect(punto).toHaveTextContent('Vencido hace 5 días');
    expect(screen.getByRole('listitem', { name: 'Punto 3.2' })).toHaveTextContent('Esperando al cliente');
  });

  it('cada acción del punto abre solo lo suyo', async () => {
    renderDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar el punto 3.1' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('evidencia: Filtro por marca');
    fireEvent.click(screen.getByRole('button', { name: 'Tareas del punto 3.1' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('tareas: Filtro por marca');
    fireEvent.click(screen.getByRole('button', { name: 'Evidencias del punto 3.1' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('evidencia: Filtro por marca');
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar el punto 3.1' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('gestionar: Filtro por marca');
  });

  it('muestra las notas del cliente y los ajustes pedidos en el punto', async () => {
    renderDetalle();
    const punto = await screen.findByRole('listitem', { name: 'Punto 3.1' });
    expect(punto).toHaveTextContent('Nota del cliente: Le gusta, pero quiere ver la versión en azul.');
    expect(punto).toHaveTextContent('Ajuste pedido: Que el filtro recuerde la última marca.');
  });

  it('abre el modo presentación', async () => {
    renderDetalle();
    expect(await screen.findByRole('link', { name: 'Presentar' })).toHaveAttribute('href', '/minutas/m3/presentar');
  });

  it('un punto del cliente no tiene tareas', async () => {
    renderDetalle();
    await screen.findByRole('listitem', { name: 'Punto 3.2' });
    expect(screen.queryByRole('button', { name: 'Tareas del punto 3.2' })).not.toBeInTheDocument();
  });

  it('agrega un punto con Enter', async () => {
    vi.mocked(minutasApi.agregarPunto).mockResolvedValue({ ...minuta, items: [...minuta.items, punto({ id: 'i3', numero: 3, titulo: 'Botón de WhatsApp', estado: 'pendiente' })] });
    renderDetalle();
    const campo = await screen.findByPlaceholderText('Agregar un punto y presionar Enter');
    fireEvent.change(campo, { target: { value: 'Botón de WhatsApp' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(minutasApi.agregarPunto).toHaveBeenCalledWith('m3', { titulo: 'Botón de WhatsApp' }));
    expect(await screen.findByRole('listitem', { name: 'Punto 3.3' })).toHaveTextContent('Botón de WhatsApp');
  });

  it('publica una minuta en borrador', async () => {
    vi.mocked(minutasApi.editarMinuta).mockResolvedValue({ ...minuta, estado: 'publicada' });
    renderDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(minutasApi.editarMinuta).toHaveBeenCalledWith('m3', { estado: 'publicada' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument());
  });
});

describe('MinutaDetalle · editar y borrar', () => {
  beforeEach(() => {
    vi.mocked(minutasApi.obtenerMinuta).mockReset().mockResolvedValue(minuta);
    vi.mocked(minutasApi.editarMinuta).mockReset();
    vi.mocked(minutasApi.borrarMinuta).mockReset();
    navigate.mockReset();
  });

  it('edita el título y el resumen', async () => {
    vi.mocked(minutasApi.editarMinuta).mockResolvedValue({ ...minuta, titulo: 'Revisión del home' });
    renderDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Título de la minuta'), { target: { value: 'Revisión del home' } });
    fireEvent.change(screen.getByLabelText('Resumen y acuerdos'), { target: { value: 'Lanzamiento el 26 de noviembre. Revisiones los lunes.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(minutasApi.editarMinuta).toHaveBeenCalledWith('m3', expect.objectContaining({
      titulo: 'Revisión del home', resumen: 'Lanzamiento el 26 de noviembre. Revisiones los lunes.',
    })));
    expect(await screen.findByRole('heading', { name: 'Revisión del home' })).toBeInTheDocument();
  });

  it('edita el equipo buscando a la persona', async () => {
    vi.mocked(apiClient.getProfiles).mockResolvedValue([
      { id: 'u1', nombre: 'Even' }, { id: 'u2', nombre: 'Diego Ruiz' }, { id: 'u3', nombre: 'Andrés Monge' },
    ]);
    vi.mocked(minutasApi.editarMinuta).mockResolvedValue(minuta);
    renderDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Buscar persona' }), { target: { value: 'andres' } });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Andrés Monge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(minutasApi.editarMinuta).toHaveBeenCalledWith('m3', expect.objectContaining({ miembros: ['u2', 'u3'] })));
  });

  it('borra la minuta tras confirmar y vuelve a la lista', async () => {
    vi.mocked(minutasApi.borrarMinuta).mockResolvedValue({ ok: true });
    renderDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar minuta' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, borrar' }));
    await waitFor(() => expect(minutasApi.borrarMinuta).toHaveBeenCalledWith('m3'));
    expect(navigate).toHaveBeenCalledWith('/minutas');
  });
});

describe('MinutaDetalle · PDF', () => {
  const writeText = vi.fn();
  beforeEach(() => {
    vi.mocked(minutasApi.obtenerMinuta).mockReset().mockResolvedValue(minuta);
    vi.mocked(minutaPdf.exportarMinutaPdf).mockReset();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  it('exporta un solo PDF, sin los puntos internos', async () => {
    renderDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar PDF' }));
    expect(minutaPdf.exportarMinutaPdf).toHaveBeenCalledWith(minuta, { soloVisibles: true });
    expect(screen.queryByRole('button', { name: 'PDF para el cliente' })).not.toBeInTheDocument();
  });

  it('mientras arma el PDF (baja las capturas) lo dice y no deja pedirlo dos veces', async () => {
    let terminar: () => void = () => {};
    vi.mocked(minutaPdf.exportarMinutaPdf).mockReturnValue(new Promise<void>((r) => { terminar = r; }));
    renderDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar PDF' }));
    expect(await screen.findByRole('button', { name: 'Generando PDF…' })).toBeDisabled();
    await act(async () => { terminar(); });
    expect(await screen.findByRole('button', { name: 'Exportar PDF' })).toBeEnabled();
  });
});

describe('MinutaDetalle · reordenar puntos', () => {
  const titulos = () => screen.getAllByRole('listitem', { name: /^Punto 3\.\d$/ }).map((li) => li.querySelector('p')?.textContent);
  const arrastrar = (desde: string, hasta: string) =>
    act(async () => { soltar?.({ active: { id: desde }, over: { id: hasta } } as unknown as DragEndEvent); });

  beforeEach(() => {
    vi.mocked(minutasApi.obtenerMinuta).mockReset().mockResolvedValue(minuta);
    vi.mocked(minutasApi.reordenarPuntos).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('mueve el punto al instante y guarda el nuevo orden', async () => {
    const reordenada = { ...minuta, items: [{ ...minuta.items[1], numero: 1 }, { ...minuta.items[0], numero: 2 }] };
    vi.mocked(minutasApi.reordenarPuntos).mockResolvedValue(reordenada);
    renderDetalle();
    await screen.findByRole('listitem', { name: 'Punto 3.1' });
    await arrastrar('i2', 'i1');
    expect(minutasApi.reordenarPuntos).toHaveBeenCalledWith('m3', ['i2', 'i1']);
    await waitFor(() => expect(titulos()).toEqual(['Fichas técnicas', 'Filtro por marca']));
    expect(screen.getByRole('listitem', { name: 'Punto 3.1' })).toHaveTextContent('Fichas técnicas');
  });

  it('si no se pudo guardar, vuelve al orden anterior y avisa', async () => {
    vi.mocked(minutasApi.reordenarPuntos).mockRejectedValue(new Error('Sin conexión'));
    renderDetalle();
    await screen.findByRole('listitem', { name: 'Punto 3.1' });
    await arrastrar('i2', 'i1');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo cambiar el orden', { description: 'Sin conexión' }));
    expect(titulos()).toEqual(['Filtro por marca', 'Fichas técnicas']);
  });

  it('"Enviar al cliente" abre el envío, desde el encabezado o desde la tarjeta del enlace', async () => {
    renderDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar al cliente' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Diálogo de envío');
  });
});
