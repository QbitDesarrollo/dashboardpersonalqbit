import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PuntoDialog } from './PuntoDialog';
import { urlNuevaTareaDesdePunto } from '@/lib/tareaDesdePunto';
import * as minutasApi from '@/lib/minutasApi';
import * as apiClient from '@/lib/apiClient';
import type { Minuta, Punto } from '@/lib/minutasApi';

vi.mock('@/lib/minutasApi', () => ({
  accionPunto: vi.fn(), agregarEvidencia: vi.fn(), quitarEvidencia: vi.fn(), editarPunto: vi.fn(),
  vincularTarea: vi.fn(), desvincularTarea: vi.fn(),
}));
vi.mock('@/lib/apiClient', () => ({ getTasks: vi.fn(), uploadEditorImage: vi.fn() }));
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/components/drive/DriveBrowser', () => ({
  DriveBrowser: ({ onSelect }: { onSelect: (f: unknown) => void }) => (
    <button type="button" onClick={() => onSelect({ id: 'f1', name: 'Video planta v2.mp4', webViewLink: 'https://drive.google.com/file/d/f1/view', mimeType: 'video/mp4', isFolder: false })}>
      Elegir archivo falso
    </button>
  ),
}));

const base: Punto = {
  id: 'i1', numero: 2, titulo: 'Video en el home', descripcion: null, responsable: null, responsable_cliente: false,
  fecha_compromiso: null, estado: 'en_curso', visible_cliente: true, resolucion: null, completado_por: null,
  completado_en: null, aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null, motivo_descarte: null,
  evidencias: [], tareas: [],
};
const minutaCon = (p: Partial<Punto>) => ({ id: 'm3', numero: 3, codigo: 'M-03', brand_id: 'b1', brand_nombre: 'Dinatek', project_id: 'p1', items: [{ ...base, ...p }] }) as unknown as Minuta;

function abrir(p: Partial<Punto> = {}, onActualizada = vi.fn(), vista: 'evidencia' | 'tareas' | 'gestionar' = 'evidencia') {
  const minuta = minutaCon(p);
  render(<PuntoDialog minuta={minuta} punto={minuta.items[0]} personas={[]} vista={vista} abierto onOpenChange={() => {}} onActualizada={onActualizada} />);
  return onActualizada;
}

describe('PuntoDialog · cierre con evidencia', () => {
  beforeEach(() => { vi.mocked(minutasApi.accionPunto).mockReset(); });

  it('solo deja completar con explicación y evidencia, y manda la acción', async () => {
    const actualizada = minutaCon({ estado: 'completado' });
    vi.mocked(minutasApi.accionPunto).mockResolvedValue(actualizada);
    const onActualizada = abrir({ evidencias: [{ id: 'e1', tipo: 'enlace', nombre: 'Home en staging', url: 'https://x.com', drive_file_id: null, origen_task_id: null }] });
    const completar = screen.getByRole('button', { name: 'Marcar como completado' });
    expect(completar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('¿Qué se hizo?'), { target: { value: 'Se puso un video de 12 s en el home.' } });
    expect(completar).toBeEnabled();
    fireEvent.click(completar);
    await waitFor(() => expect(minutasApi.accionPunto).toHaveBeenCalledWith('i1', 'completar', { resolucion: 'Se puso un video de 12 s en el home.' }));
    expect(onActualizada).toHaveBeenCalledWith(actualizada);
  });
});

describe('PuntoDialog · evidencias', () => {
  beforeEach(() => { vi.mocked(minutasApi.agregarEvidencia).mockReset(); vi.mocked(minutasApi.quitarEvidencia).mockReset(); });

  it('adjunta un enlace como evidencia', async () => {
    vi.mocked(minutasApi.agregarEvidencia).mockResolvedValue(minutaCon({}));
    const onActualizada = abrir();
    fireEvent.change(screen.getByLabelText('Nombre del enlace'), { target: { value: 'Home en staging' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://staging.example.com/home' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar enlace' }));
    await waitFor(() => expect(minutasApi.agregarEvidencia).toHaveBeenCalledWith('i1', {
      tipo: 'enlace', nombre: 'Home en staging', url: 'https://staging.example.com/home',
    }));
    expect(onActualizada).toHaveBeenCalled();
  });

  it('quita una evidencia de la lista', async () => {
    vi.mocked(minutasApi.quitarEvidencia).mockResolvedValue(minutaCon({}));
    abrir({ evidencias: [{ id: 'e1', tipo: 'drive', nombre: 'Video planta v2.mp4', url: 'https://drive.google.com/x', drive_file_id: 'x', origen_task_id: null }] });
    expect(screen.getByRole('link', { name: /Video planta v2.mp4/ })).toHaveAttribute('href', 'https://drive.google.com/x');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Video planta v2.mp4' }));
    await waitFor(() => expect(minutasApi.quitarEvidencia).toHaveBeenCalledWith('e1'));
  });
});

describe('PuntoDialog · evidencia desde Drive', () => {
  beforeEach(() => { vi.mocked(minutasApi.agregarEvidencia).mockReset(); });

  it('agrega un archivo de Drive sin adjuntarlo a ninguna tarea', async () => {
    vi.mocked(minutasApi.agregarEvidencia).mockResolvedValue(minutaCon({}));
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir de Drive' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir archivo falso' }));
    await waitFor(() => expect(minutasApi.agregarEvidencia).toHaveBeenCalledWith('i1', {
      tipo: 'drive', nombre: 'Video planta v2.mp4', url: 'https://drive.google.com/file/d/f1/view', drive_file_id: 'f1',
    }));
  });
});

describe('PuntoDialog · punto completado', () => {
  beforeEach(() => { vi.mocked(minutasApi.accionPunto).mockReset(); });

  const completado: Partial<Punto> = {
    estado: 'completado', resolucion: 'Se puso un video de 12 s en el home.',
    evidencias: [{ id: 'e1', tipo: 'enlace', nombre: 'Home en staging', url: 'https://x.com', drive_file_id: null, origen_task_id: null }],
  };

  it('muestra qué se hizo y permite aprobarlo en reunión', async () => {
    vi.mocked(minutasApi.accionPunto).mockResolvedValue(minutaCon({ estado: 'aprobado' }));
    abrir(completado);
    expect(screen.getByText('Se puso un video de 12 s en el home.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aprobado en reunión' }));
    await waitFor(() => expect(minutasApi.accionPunto).toHaveBeenCalledWith('i1', 'aprobar', {}));
  });

  it('permite reabrirlo', async () => {
    vi.mocked(minutasApi.accionPunto).mockResolvedValue(minutaCon({ estado: 'en_curso' }));
    abrir(completado);
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(minutasApi.accionPunto).toHaveBeenCalledWith('i1', 'reabrir', {}));
  });
});

describe('PuntoDialog · gestionar', () => {
  beforeEach(() => { vi.mocked(minutasApi.editarPunto).mockReset(); vi.mocked(minutasApi.accionPunto).mockReset(); });

  it('guarda los cambios del punto', async () => {
    vi.mocked(minutasApi.editarPunto).mockResolvedValue(minutaCon({}));
    abrir({}, vi.fn(), 'gestionar');
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: 'Con imagen de respaldo.' } });
    fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: 'cliente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(minutasApi.editarPunto).toHaveBeenCalledWith('i1', {
      titulo: 'Video en el home', descripcion: 'Con imagen de respaldo.', responsable_user_id: null,
      responsable_cliente: true, fecha_compromiso: null, visible_cliente: true,
    }));
  });

  it('descarta el punto solo con un motivo', async () => {
    vi.mocked(minutasApi.accionPunto).mockResolvedValue(minutaCon({ estado: 'descartado' }));
    abrir({}, vi.fn(), 'gestionar');
    fireEvent.click(screen.getByRole('button', { name: 'Descartar punto' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar descarte' });
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo del descarte'), { target: { value: 'El cliente retiró el pedido.' } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(minutasApi.accionPunto).toHaveBeenCalledWith('i1', 'descartar', { motivo: 'El cliente retiró el pedido.' }));
  });
});

describe('PuntoDialog · tareas', () => {
  beforeEach(() => {
    vi.mocked(minutasApi.vincularTarea).mockReset();
    vi.mocked(minutasApi.desvincularTarea).mockReset();
    vi.mocked(apiClient.getTasks).mockReset();
  });

  it('lista las tareas vinculadas y permite desvincular', async () => {
    vi.mocked(minutasApi.desvincularTarea).mockResolvedValue(minutaCon({}));
    abrir({ tareas: [{ id: 't1', titulo_tarea: 'Editar el video de planta', estado: 'en_proceso', fecha_entrega: '2026-09-26', responsable: { id: 'u1', nombre: 'Majo Vera' } }] }, vi.fn(), 'tareas');
    expect(screen.getByText('Editar el video de planta')).toBeInTheDocument();
    expect(screen.getByText(/En proceso/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desvincular Editar el video de planta' }));
    await waitFor(() => expect(minutasApi.desvincularTarea).toHaveBeenCalledWith('i1', 't1'));
  });

  it('busca una tarea de la misma marca y la vincula', async () => {
    vi.mocked(apiClient.getTasks).mockResolvedValue({ tasks: [{ id: 't9', titulo_tarea: 'Maquetar el menú principal', estado: 'backlog' }], total: 1 });
    vi.mocked(minutasApi.vincularTarea).mockResolvedValue(minutaCon({}));
    abrir({}, vi.fn(), 'tareas');
    fireEvent.change(screen.getByLabelText('Buscar una tarea de Dinatek'), { target: { value: 'menú' } });
    await waitFor(() => expect(apiClient.getTasks).toHaveBeenCalledWith({ brand_id: 'b1', search: 'menú', limit: 8 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Vincular Maquetar el menú principal' }));
    await waitFor(() => expect(minutasApi.vincularTarea).toHaveBeenCalledWith('i1', 't9'));
  });
});

describe('PuntoDialog · nueva tarea', () => {
  beforeEach(() => { navigate.mockReset(); });

  it('abre el formulario de tarea de siempre, prellenado con el punto', () => {
    abrir({ descripcion: 'Botón fijo abajo.', fecha_compromiso: '2026-10-03' }, vi.fn(), 'tareas');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva tarea' }));
    expect(navigate).toHaveBeenCalledWith(urlNuevaTareaDesdePunto({
      brandId: 'b1', projectId: 'p1', titulo: 'Video en el home',
      detalle: 'Botón fijo abajo.\n\nOrigen: Dinatek M-03, punto 3.2.',
      fechaEntrega: '2026-10-03', minutaItemId: 'i1', minutaId: 'm3',
    }));
  });
});

describe('PuntoDialog · sin pestañas', () => {
  it('muestra una sola vista, sin barra de pestañas', () => {
    abrir({}, vi.fn(), 'tareas');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva tarea' })).toBeInTheDocument();
  });
});

describe('PuntoDialog · imágenes como evidencia', () => {
  const url = 'https://tiusdei.qbit.ec/uploads/editor/3f2a9c1e.png';
  const captura = () => new File(['png'], 'captura-home.png', { type: 'image/png' });
  beforeEach(() => {
    vi.mocked(apiClient.uploadEditorImage).mockReset().mockResolvedValue({ url });
    vi.mocked(minutasApi.agregarEvidencia).mockReset().mockResolvedValue(minutaCon({}));
  });

  it('sube una imagen y la guarda como evidencia', async () => {
    abrir();
    fireEvent.change(screen.getByLabelText('Subir imagen'), { target: { files: [captura()] } });
    await waitFor(() => expect(minutasApi.agregarEvidencia).toHaveBeenCalledWith('i1', { tipo: 'imagen', nombre: 'captura-home.png', url }));
  });

  it('pegar una captura con Ctrl+V también la agrega', async () => {
    abrir();
    fireEvent.paste(screen.getByRole('dialog'), { clipboardData: { files: [captura()], getData: () => '' } });
    await waitFor(() => expect(apiClient.uploadEditorImage).toHaveBeenCalled());
    await waitFor(() => expect(minutasApi.agregarEvidencia).toHaveBeenCalledWith('i1', expect.objectContaining({ tipo: 'imagen' })));
  });

  it('muestra las imágenes como miniatura', () => {
    abrir({ evidencias: [{ id: 'e1', tipo: 'imagen', nombre: 'captura-home.png', url, drive_file_id: null, origen_task_id: null }] });
    expect(screen.getByRole('img', { name: 'captura-home.png' })).toHaveAttribute('src', url);
  });
});
