import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MinutaPresentar from './MinutaPresentar';
import * as minutasApi from '@/lib/minutasApi';
import type { Minuta, Punto } from '@/lib/minutasApi';

vi.mock('@/lib/minutasApi', () => ({ obtenerMinuta: vi.fn(), accionPunto: vi.fn(), agregarNota: vi.fn() }));

const punto = (p: Partial<Punto>): Punto => ({
  id: 'i1', numero: 1, titulo: 'Video en el home', descripcion: 'Que se reproduzca solo y sin sonido', responsable: { id: 'u2', nombre: 'Diego Ruiz' },
  responsable_cliente: false, fecha_compromiso: '2026-09-19', estado: 'completado', visible_cliente: true,
  resolucion: 'Se puso un video de 12 s en el home.', completado_por: { id: 'u2', nombre: 'Diego Ruiz' }, completado_en: '2026-09-23T15:00:00.000Z',
  aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null, motivo_descarte: null,
  evidencias: [{ id: 'e1', tipo: 'imagen', nombre: 'home.png', url: 'https://tiusdei.qbit.ec/uploads/editor/abc.png', drive_file_id: null, origen_task_id: null }],
  tareas: [], notas: [], ...p,
});

const minuta: Minuta = {
  id: 'm3', brand_id: 'b1', brand_nombre: 'Dinatek', project_id: null, project_nombre: null,
  numero: 3, codigo: 'M-03', titulo: 'Revisión de avance: home y catálogo', fecha: '2026-09-22', estado: 'publicada',
  owner: { id: 'u1', nombre: 'Even' }, miembros: [], resumen: 'Acuerdo: lanzamiento el 26 de noviembre.', progreso: { total: 3, cerrados: 1, enCurso: 1 },
  items: [
    punto({}),
    punto({ id: 'i2', numero: 2, titulo: 'Revisar costos del hosting', visible_cliente: false, estado: 'en_curso' }),
    punto({ id: 'i3', numero: 3, titulo: 'Banner de navidad', estado: 'descartado', motivo_descarte: 'Ya no aplica.' }),
    punto({ id: 'i4', numero: 4, titulo: 'Fichas técnicas', responsable: null, responsable_cliente: true, estado: 'pendiente', resolucion: null, evidencias: [] }),
  ],
};

function renderPresentar() {
  render(
    <MemoryRouter initialEntries={['/minutas/m3/presentar']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/minutas/:id/presentar" element={<MinutaPresentar />} /></Routes>
    </MemoryRouter>,
  );
}

describe('MinutaPresentar', () => {
  beforeEach(() => {
    vi.mocked(minutasApi.obtenerMinuta).mockReset().mockResolvedValue(minuta);
    vi.mocked(minutasApi.accionPunto).mockReset();
    vi.mocked(minutasApi.agregarNota).mockReset();
  });

  it('muestra solo los puntos que ve el cliente, uno a la vez, con lo que se hizo', async () => {
    renderPresentar();
    expect(await screen.findByRole('heading', { name: 'Video en el home' })).toBeInTheDocument();
    expect(screen.getByText('Que se reproduzca solo y sin sonido')).toBeInTheDocument();
    expect(screen.getByText('Se puso un video de 12 s en el home.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'home.png' })).toBeInTheDocument();
    expect(screen.getByText('Listo')).toBeInTheDocument();
    expect(screen.getByText('Punto 1 de 2')).toBeInTheDocument();
    expect(screen.queryByText('Revisar costos del hosting')).not.toBeInTheDocument();
    expect(screen.queryByText('Banner de navidad')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('heading', { name: 'Fichas técnicas' })).toBeInTheDocument();
    expect(screen.getByText('Pendiente de tu parte')).toBeInTheDocument();
    expect(screen.getByText('Punto 2 de 2')).toBeInTheDocument();
  });

  it('el cliente aprueba un punto listo', async () => {
    const aprobado = { ...minuta, items: minuta.items.map((p) => (p.id === 'i1' ? { ...p, estado: 'aprobado' as const } : p)) };
    vi.mocked(minutasApi.accionPunto).mockResolvedValue(aprobado);
    renderPresentar();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    expect(minutasApi.accionPunto).toHaveBeenCalledWith('i1', 'aprobar', {});
    expect(await screen.findByText('Aprobado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });

  it('no ofrece aprobar lo que todavía no está listo ni lo que le toca al cliente', async () => {
    renderPresentar();
    fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }));
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });

  it('el cliente pide un ajuste y hay que decir cuál', async () => {
    vi.mocked(minutasApi.accionPunto).mockResolvedValue(minuta);
    renderPresentar();
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir ajuste' }));
    const enviar = screen.getByRole('button', { name: 'Enviar ajuste' });
    expect(enviar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('¿Qué ajuste pide el cliente?'), { target: { value: '  Que el video no tenga sonido.  ' } });
    fireEvent.click(enviar);
    expect(minutasApi.accionPunto).toHaveBeenCalledWith('i1', 'pedir_ajuste', { motivo: 'Que el video no tenga sonido.' });
    await waitFor(() => expect(screen.queryByLabelText('¿Qué ajuste pide el cliente?')).not.toBeInTheDocument());
  });

  it('deja una nota del cliente en cualquier punto y la muestra', async () => {
    const conNota = {
      ...minuta,
      items: minuta.items.map((p) => (p.id === 'i4'
        ? { ...p, notas: [{ id: 'n1', tipo: 'nota' as const, texto: 'Las envía el lunes.', created_at: '2026-09-24T15:00:00.000Z', autor: { id: 'u1', nombre: 'Even' } }] }
        : p)),
    };
    vi.mocked(minutasApi.agregarNota).mockResolvedValue(conNota);
    renderPresentar();
    fireEvent.click(await screen.findByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar nota' }));
    const guardar = screen.getByRole('button', { name: 'Guardar nota' });
    expect(guardar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nota del cliente'), { target: { value: ' Las envía el lunes. ' } });
    fireEvent.click(guardar);
    expect(minutasApi.agregarNota).toHaveBeenCalledWith('i4', 'Las envía el lunes.');
    await waitFor(() => expect(within(screen.getByRole('article')).getByRole('listitem')).toHaveTextContent('Las envía el lunes.'));
    expect(screen.queryByLabelText('Nota del cliente')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fichas técnicas' })).toBeInTheDocument();
  });

  it('siempre muestra el resumen de la minuta mientras se recorren los puntos', async () => {
    renderPresentar();
    const resumen = await screen.findByRole('region', { name: 'Resumen y acuerdos' });
    expect(resumen).toHaveTextContent('Acuerdo: lanzamiento el 26 de noviembre.');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByRole('region', { name: 'Resumen y acuerdos' })).toHaveTextContent('Acuerdo: lanzamiento el 26 de noviembre.');
  });

  it('el índice lista los puntos visibles y lleva a cualquiera', async () => {
    renderPresentar();
    const indice = await screen.findByRole('navigation', { name: 'Puntos de la minuta' });
    const botones = within(indice).getAllByRole('button');
    expect(botones.map((b) => b.textContent)).toEqual([expect.stringContaining('3.1'), expect.stringContaining('3.4')]);
    expect(within(indice).getByRole('button', { name: /Video en el home/ })).toHaveAttribute('aria-current', 'step');
    fireEvent.click(within(indice).getByRole('button', { name: /Fichas técnicas/ }));
    expect(screen.getByRole('heading', { name: 'Fichas técnicas' })).toBeInTheDocument();
    expect(within(indice).getByRole('button', { name: /Fichas técnicas/ })).toHaveAttribute('aria-current', 'step');
  });

  it('avanza y retrocede con las flechas, salvo mientras se escribe una nota', async () => {
    renderPresentar();
    await screen.findByRole('heading', { name: 'Video en el home' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: 'Fichas técnicas' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { name: 'Video en el home' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar nota' }));
    fireEvent.keyDown(screen.getByLabelText('Nota del cliente'), { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: 'Video en el home' })).toBeInTheDocument();
  });

  it('muestra cuántos puntos para el cliente ya están listos', async () => {
    renderPresentar();
    expect(await screen.findByText('1 de 2 listos')).toBeInTheDocument();
  });

  it('permite salir de la presentación a la minuta', async () => {
    renderPresentar();
    expect(await screen.findByRole('link', { name: 'Salir de la presentación' })).toHaveAttribute('href', '/minutas/m3');
  });
});
