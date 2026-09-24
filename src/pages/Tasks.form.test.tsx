/**
 * Characterization tests for the create/edit task form on the Tasks page.
 * They pin the current behavior (payload sent to the API, validation and side effects)
 * so the form can be extracted into a shared component without changing what it does.
 */
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { sendTaskNotification } from '@/lib/api';
import Tasks from './Tasks';

vi.mock('@/lib/apiClient', () => {
  const definidas: Record<string, unknown> = {};
  return new Proxy(definidas, {
    get: (obj, key: string) => {
      if (key === 'then' || key === '__esModule') return undefined;
      if (!(key in obj)) obj[key] = vi.fn(async () => []);
      return obj[key];
    },
    has: () => true,
  });
});
vi.mock('@/lib/api', () => ({ sendTaskNotification: vi.fn(async () => ({})) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u1', nombre: 'Even', rol: 'admin' }, user: { id: 'u1' }, isAdmin: true, isEjecutivo: false, isEquipo: false, isCliente: false }),
}));
vi.mock('@/contexts/GlobalFilterContext', () => ({ useGlobalFilter: () => ({ pinnedDeskId: null, pinnedBrandId: null }) }));
vi.mock('@/components/RichTextEditor', () => ({
  RichTextEditor: ({ content, onChange }: { content: string; onChange: (html: string) => void }) => (
    <textarea aria-label="Detalle de la tarea" value={content} onChange={(e) => onChange(e.target.value)} />
  ),
  RichTextViewer: ({ content }: { content: string }) => <div>{content}</div>,
}));
vi.mock('@/components/TodayMeetings', () => ({ TodayMeetings: () => null }));
vi.mock('@/components/tasks/ResponsableMetrics', () => ({ ResponsableMetrics: () => null }));
vi.mock('@/components/tasks/FileUploader', () => ({
  FileUploader: ({ onFilesChange }: { onFilesChange: (f: unknown[]) => void }) => (
    <button type="button" onClick={() => onFilesChange([{ id: 'f1', nombre: 'brief.pdf' }])}>Adjuntar archivo de prueba</button>
  ),
}));
vi.mock('@/components/drive/DriveBrowser', () => ({
  DriveBrowser: ({ onSelect }: { onSelect: (f: unknown) => void }) => (
    <button type="button" onClick={() => onSelect({ id: 'd1', name: 'Guion.docx' })}>Elegir archivo de Drive de prueba</button>
  ),
}));
vi.mock('@/components/tasks/CustomFieldsForm', () => ({
  CustomFieldsForm: ({ onChange }: { onChange: (id: string, v: unknown) => void }) => (
    <input aria-label="Campo personalizado de prueba" onChange={(e) => onChange('cf1', e.target.value)} />
  ),
}));
vi.mock('@/components/tasks/TaskFiles', () => ({ TaskFiles: () => <p>Archivos de la tarea</p> }));
vi.mock('@/components/tasks/ProjectSelect', () => ({
  ProjectSelect: ({ brandId, value, onChange }: { brandId: string; value: string; onChange: (id: string | null) => void }) => (
    <select aria-label={`Proyecto de ${brandId || 'ninguna marca'}`} value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Sin proyecto</option><option value="p1">Rediseño web</option>
    </select>
  ),
}));
vi.mock('@/components/tasks/DepartmentSelect', async (orig) => ({
  ...(await orig<typeof import('@/components/tasks/DepartmentSelect')>()),
  DepartmentSelect: ({ value, onChange }: { value: string; onChange: (id: string | null) => void }) => (
    <select aria-label="Departamento de prueba" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Sin departamento</option><option value="dep-diseno">Diseño</option><option value="dep-video">Video</option>
    </select>
  ),
}));

const m = vi.mocked(api) as unknown as Record<string, ReturnType<typeof vi.fn>>;

const BRANDS = [{ id: 'b1', nombre: 'Dinatek', activo: 1 }, { id: 'b2', nombre: 'Pronaca', activo: 1 }];
const DESKS = [{ id: 'd1', nombre: 'Mesa Digital', activo: 1 }, { id: 'd2', nombre: 'Mesa Retail', activo: 1 }];
const DELIVERABLE_TYPES = [
  { id: 'dt1', nombre: 'Post estático', activo: 1, minutos_estimados: null },
  { id: 'dt2', nombre: 'Reel', activo: 1, minutos_estimados: 90 },
];
const MIEMBROS = [
  { id: 'u2', nombre: 'Diego Ruiz', email: 'diego@qbit.ec', department_id: 'dep-diseno' },
  { id: 'u3', nombre: 'Ana Mora', email: 'ana@qbit.ec', department_id: 'dep-video' },
];

const TAREA = {
  id: 't1', titulo_tarea: 'Carrusel de lanzamiento', detalle: '<p>Tres láminas</p>', brand_id: 'b1', desk_id: null,
  responsable_user_id: null, responsables: [], departamento: null, department_id: null, project_id: null,
  prioridad: 'alta', estado: 'en_proceso', fecha_inicio: '2026-09-20', fecha_entrega: '2026-09-30', fecha_cliente: null,
  cantidad_entregables: 3, enlaces: ['https://figma.com/x'], task_type_id: null, tipo_entregable_id: 'dt1',
  deliverable_types_list: [{ tipo_entregable_id: 'dt1', cantidad: 3 }], estimated_hours: null,
  recurrence_type: 'none', recurrence_interval: null, recurrence_end_date: null, client_board_id: null,
  check_done: false, created_at: '2026-09-20T10:00:00.000Z', brands: { nombre: 'Dinatek' },
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  localStorage.clear();
  Object.values(m).forEach((fn) => fn.mockReset?.().mockImplementation?.(async () => []));
  vi.mocked(sendTaskNotification).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  m.getTasks.mockResolvedValue({ tasks: [TAREA], total: 1 });
  m.getBrands.mockResolvedValue(BRANDS);
  m.getDesks.mockResolvedValue(DESKS);
  m.getProfiles.mockImplementation(async (deskId?: string) => (deskId ? MIEMBROS : [{ id: 'u1', nombre: 'Even' }, ...MIEMBROS]));
  m.getDeliverableTypes.mockResolvedValue(DELIVERABLE_TYPES);
  m.getSiteSettings.mockResolvedValue({});
  m.getTask.mockResolvedValue(TAREA);
  m.createTask.mockResolvedValue({ id: 't-nueva' });
  m.patchTask.mockResolvedValue({ id: 't1' });
});

// The page keeps loading data after each interaction; let it settle inside act before unmounting.
afterEach(async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});

function renderTasks() {
  render(
    <MemoryRouter initialEntries={['/tareas']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Tasks />
    </MemoryRouter>,
  );
}

/** Contenedor del campo con esa etiqueta dentro del formulario. */
function campo(etiqueta: RegExp): HTMLElement {
  const form = screen.getByRole('dialog');
  const label = within(form).getAllByText(etiqueta).find((el) => el.tagName === 'LABEL');
  if (!label) throw new Error(`No hay etiqueta ${etiqueta}`);
  return label.closest('.space-y-2') as HTMLElement;
}

async function elegir(etiqueta: RegExp, opcion: string, indice = 0) {
  const trigger = within(campo(etiqueta)).getAllByRole('combobox')[indice];
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: opcion }));
  // Choosing a desk loads its team and brands; let those requests land inside act.
  await act(async () => {});
}

async function abrirEdicion(titulo: string) {
  renderTasks();
  const fila = (await screen.findByText(titulo)).closest('tr') as HTMLElement;
  const editar = within(fila).getAllByRole('button').find((b) => b.querySelector('svg.lucide-square-pen, svg.lucide-pen-box, svg.lucide-edit'));
  if (!editar) throw new Error('No hay botón de editar en la fila');
  fireEvent.click(editar);
  return screen.findByRole('dialog', { name: 'Editar Tarea' });
}

async function abrirNuevaTarea() {
  renderTasks();
  await screen.findByText('Carrusel de lanzamiento');
  fireEvent.click(screen.getByRole('button', { name: /Nueva Tarea/ }));
  return screen.findByRole('dialog', { name: 'Nueva Tarea' });
}

async function llenarMinimo() {
  fireEvent.change(screen.getByLabelText(/^Título/), { target: { value: 'Banner del día de la madre' } });
  await elegir(/^Marca/, 'Dinatek');
  await elegir(/^Tipos de Entregable/, 'Post estático');
  fireEvent.change(within(campo(/^Tipos de Entregable/)).getByPlaceholderText('Cant.'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText(/^Fecha Entrega/), { target: { value: '2026-10-01' } });
}

const PAYLOAD_MINIMO = {
  titulo_tarea: 'Banner del día de la madre', detalle: null, brand_id: 'b1', desk_id: null,
  responsable_user_id: null, responsable_ids: [], departamento: null, department_id: null, project_id: null,
  prioridad: 'media', estado: 'backlog', fecha_inicio: null, fecha_entrega: '2026-10-01',
  cantidad_entregables: 2, enlaces: null, task_type_id: null, tipo_entregable_id: 'dt1',
  entregables: [{ tipo_entregable_id: 'dt1', cantidad: 2 }], estimated_hours: null,
  recurrence_type: 'none', recurrence_interval: null, recurrence_end_date: null,
};

describe('Tasks · formulario de tarea (caracterización)', () => {
  it('crea una tarea con el payload completo, cierra el formulario y recuerda la selección', async () => {
    await abrirNuevaTarea();
    await llenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tarea' }));

    await waitFor(() => expect(m.createTask).toHaveBeenCalledWith(PAYLOAD_MINIMO));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tarea creada'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('nueva_tarea_defaults') ?? '{}')).toEqual({
      brand_id: 'b1', desk_id: '', departamento: '', department_id: '', project_id: '', task_type_id: '', prioridad: 'media',
    });
  });

  it('no crea la tarea sin tipo de entregable', async () => {
    await abrirNuevaTarea();
    fireEvent.change(screen.getByLabelText(/^Título/), { target: { value: 'Banner del día de la madre' } });
    await elegir(/^Marca/, 'Dinatek');
    fireEvent.change(screen.getByLabelText(/^Fecha Entrega/), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tarea' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Indica el tipo de entregable', { description: 'El tipo y el número de entregables son obligatorios.' }));
    expect(m.createTask).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Nueva Tarea' })).toBeInTheDocument();
  });

  it('precarga la selección de la última tarea creada', async () => {
    localStorage.setItem('nueva_tarea_defaults', JSON.stringify({
      brand_id: 'b2', desk_id: '', departamento: '', department_id: 'dep-video', project_id: 'p1', task_type_id: '', prioridad: 'alta',
    }));
    await abrirNuevaTarea();
    fireEvent.change(screen.getByLabelText(/^Título/), { target: { value: 'Reel de temporada' } });
    await elegir(/^Tipos de Entregable/, 'Post estático');
    fireEvent.change(screen.getByLabelText(/^Fecha Entrega/), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tarea' }));

    await waitFor(() => expect(m.createTask).toHaveBeenCalledWith(expect.objectContaining({
      brand_id: 'b2', department_id: 'dep-video', project_id: 'p1', prioridad: 'alta',
    })));
  });

  it('manda proyecto, departamento, prioridad, estado, fechas, detalle, enlaces y recurrencia', async () => {
    await abrirNuevaTarea();
    await llenarMinimo();
    fireEvent.change(screen.getByLabelText('Proyecto de b1'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Departamento de prueba'), { target: { value: 'dep-diseno' } });
    await elegir(/^Prioridad/, 'Alta');
    await elegir(/^Estado/, 'En Proceso');
    fireEvent.change(screen.getByLabelText(/^Fecha Inicio/), { target: { value: '2026-09-25' } });
    fireEvent.change(screen.getByLabelText('Detalle de la tarea'), { target: { value: '<p>Versión vertical</p>' } });
    fireEvent.change(screen.getByLabelText(/^Enlaces/), { target: { value: 'https://a.com\n\nhttps://b.com' } });
    await elegir(/^Recurrencia/, 'Personalizada');
    fireEvent.change(screen.getByLabelText(/^Intervalo/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/^Fin Recurrencia/), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tarea' }));

    await waitFor(() => expect(m.createTask).toHaveBeenCalledWith({
      ...PAYLOAD_MINIMO,
      project_id: 'p1', department_id: 'dep-diseno', prioridad: 'alta', estado: 'en_proceso', fecha_inicio: '2026-09-25',
      detalle: '<p>Versión vertical</p>', enlaces: ['https://a.com', 'https://b.com'],
      recurrence_type: 'custom', recurrence_interval: 10, recurrence_end_date: '2026-12-31',
    }));
  });

  it('suma varios tipos de entregable', async () => {
    await abrirNuevaTarea();
    await llenarMinimo();
    fireEvent.click(within(campo(/^Tipos de Entregable/)).getByRole('button', { name: /Agregar/ }));
    await elegir(/^Tipos de Entregable/, 'Reel', 1);
    fireEvent.change(within(campo(/^Tipos de Entregable/)).getAllByPlaceholderText('Cant.')[1], { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tarea' }));

    await waitFor(() => expect(m.createTask).toHaveBeenCalledWith(expect.objectContaining({
      cantidad_entregables: 5, tipo_entregable_id: 'dt1',
      entregables: [{ tipo_entregable_id: 'dt1', cantidad: 2 }, { tipo_entregable_id: 'dt2', cantidad: 3 }],
      estimated_hours: 4.5,
    })));
  });

  it('calcula las horas estimadas por tipo de entregable hasta que alguien las escribe', async () => {
    await abrirNuevaTarea();
    await elegir(/^Tipos de Entregable/, 'Reel');
    fireEvent.change(within(campo(/^Tipos de Entregable/)).getByPlaceholderText('Cant.'), { target: { value: '2' } });
    expect(screen.getByLabelText(/^Horas Estimadas/)).toHaveValue(3);
    expect(screen.getByText(/Calculado por tipo de entregable \(2 × Reel \(90 min\)\)/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Horas Estimadas/), { target: { value: '5' } });
    fireEvent.change(within(campo(/^Tipos de Entregable/)).getByPlaceholderText('Cant.'), { target: { value: '4' } });
    expect(screen.getByLabelText(/^Horas Estimadas/)).toHaveValue(5);
    fireEvent.click(screen.getByRole('button', { name: 'Usar ese cálculo' }));
    expect(screen.getByLabelText(/^Horas Estimadas/)).toHaveValue(6);
  });

  it('con mesa: ofrece a su equipo, el primer responsable pone el departamento y se le avisa por correo', async () => {
    m.getDeskBrands.mockResolvedValue([BRANDS[0]]);
    await abrirNuevaTarea();
    await elegir(/^Mesa/, 'Mesa Digital');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Diego Ruiz' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana Mora' }));
    expect(screen.getByLabelText('Departamento de prueba')).toHaveValue('dep-diseno');
    await llenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tarea' }));

    await waitFor(() => expect(m.createTask).toHaveBeenCalledWith(expect.objectContaining({
      desk_id: 'd1', responsable_user_id: 'u2', responsable_ids: ['u2', 'u3'], department_id: 'dep-diseno',
    })));
    await waitFor(() => expect(sendTaskNotification).toHaveBeenCalledWith({
      taskId: 't-nueva', taskTitle: 'Banner del día de la madre', brandName: 'Dinatek', fechaEntrega: '2026-10-01', prioridad: 'media',
      recipientEmail: 'diego@qbit.ec', recipientName: 'Diego Ruiz', detalle: undefined, fechaInicio: undefined, archivosAdjuntos: undefined,
    }));
    expect(m.getProfiles).toHaveBeenCalledWith('d1');
  });

  it('con mesa: solo ofrece sus marcas y quita la marca que no es de la mesa', async () => {
    m.getDeskBrands.mockResolvedValue([BRANDS[1]]);
    await abrirNuevaTarea();
    await elegir(/^Marca/, 'Dinatek');
    await elegir(/^Mesa/, 'Mesa Digital');
    await waitFor(() => expect(within(campo(/^Marca/)).getByRole('combobox')).toHaveTextContent('Seleccionar marca'));
    fireEvent.keyDown(within(campo(/^Marca/)).getByRole('combobox'), { key: 'Enter' });
    expect(await screen.findByRole('option', { name: 'Pronaca' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Dinatek' })).not.toBeInTheDocument();
  });

  it('cambiar de mesa limpia los responsables elegidos', async () => {
    await abrirNuevaTarea();
    await elegir(/^Mesa/, 'Mesa Digital');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Diego Ruiz' }));
    await elegir(/^Mesa/, 'Mesa Retail');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Diego Ruiz' })).not.toBeChecked());
  });

  it('al editar una tarea con mesa conserva sus responsables', async () => {
    m.getTasks.mockResolvedValue({
      tasks: [{ ...TAREA, desk_id: 'd1', responsable_user_id: 'u3', responsables: [{ user_id: 'u3', nombre: 'Ana Mora' }] }], total: 1,
    });
    await abrirEdicion('Carrusel de lanzamiento');
    expect(await screen.findByRole('checkbox', { name: 'Ana Mora' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));

    await waitFor(() => expect(m.patchTask).toHaveBeenCalledWith('t1', expect.objectContaining({
      desk_id: 'd1', responsable_user_id: 'u3', responsable_ids: ['u3'],
    })));
  });

  it('después de crear, adjunta archivos, archivos de Drive y campos personalizados', async () => {
    await abrirNuevaTarea();
    await llenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Adjuntar archivo de prueba' }));
    fireEvent.click(screen.getByRole('button', { name: 'Drive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Elegir archivo de Drive de prueba' }));
    expect(screen.getByText('Guion.docx')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Campo personalizado de prueba'), { target: { value: 'Instagram' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tarea' }));

    await waitFor(() => expect(m.assignFilesToTask).toHaveBeenCalledWith(['f1'], 't-nueva'));
    await waitFor(() => expect(m.attachDriveFile).toHaveBeenCalledWith('t-nueva', { id: 'd1', name: 'Guion.docx' }));
    await waitFor(() => expect(m.saveTaskCustomFields).toHaveBeenCalledWith('t-nueva', [{ field_id: 'cf1', value: 'Instagram' }]));
  });

  it('muestra el error del servidor y deja el formulario abierto', async () => {
    m.createTask.mockResolvedValue({ error: 'La marca está inactiva' });
    await abrirNuevaTarea();
    await llenarMinimo();
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tarea' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error al guardar', { description: 'La marca está inactiva' }));
    expect(screen.getByRole('dialog', { name: 'Nueva Tarea' })).toBeInTheDocument();
  });

  it('edita una tarea: precarga sus datos y guarda con PATCH', async () => {
    const dialogo = await abrirEdicion('Carrusel de lanzamiento');
    expect(screen.getByLabelText(/^Título/)).toHaveValue('Carrusel de lanzamiento');
    expect(screen.getByLabelText(/^Fecha Entrega/)).toHaveValue('2026-09-30');
    expect(screen.queryByLabelText(/^Fecha Cliente/)).not.toBeInTheDocument();
    expect(within(dialogo).getByText('Archivos de la tarea')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Título/), { target: { value: 'Carrusel de lanzamiento v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));

    await waitFor(() => expect(m.patchTask).toHaveBeenCalledWith('t1', {
      titulo_tarea: 'Carrusel de lanzamiento v2', detalle: '<p>Tres láminas</p>', brand_id: 'b1', desk_id: null,
      responsable_user_id: null, responsable_ids: [], departamento: null, department_id: null, project_id: null,
      prioridad: 'alta', estado: 'en_proceso', fecha_inicio: '2026-09-20', fecha_entrega: '2026-09-30',
      cantidad_entregables: 3, enlaces: ['https://figma.com/x'], task_type_id: null, tipo_entregable_id: 'dt1',
      entregables: [{ tipo_entregable_id: 'dt1', cantidad: 3 }], estimated_hours: null,
      recurrence_type: 'none', recurrence_interval: null, recurrence_end_date: null,
    }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tarea actualizada'));
    expect(m.createTask).not.toHaveBeenCalled();
  });

  it('al cambiar la fecha de entrega pide el motivo antes de guardar', async () => {
    await abrirEdicion('Carrusel de lanzamiento');
    fireEvent.change(screen.getByLabelText(/^Fecha Entrega/), { target: { value: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));

    const motivo = await screen.findByRole('dialog', { name: /reagend|fecha/i });
    expect(m.patchTask).not.toHaveBeenCalled();
    fireEvent.click(within(motivo).getByText('Cliente'));
    fireEvent.click(within(motivo).getByRole('button', { name: 'Confirmar cambio' }));

    await waitFor(() => expect(m.patchTask).toHaveBeenCalledWith('t1', expect.objectContaining({
      fecha_entrega: '2026-10-05', motivo_reschedule: 'CLIENTE', comentario_reschedule: null,
    })));
  });

  it('solo en tareas del tablero del cliente edita y manda la fecha del cliente', async () => {
    m.getTasks.mockResolvedValue({ tasks: [{ ...TAREA, client_board_id: 'cb1', fecha_cliente: '2026-10-02' }], total: 1 });
    await abrirEdicion('Carrusel de lanzamiento');
    expect(screen.getByLabelText(/^Fecha Cliente/)).toHaveValue('2026-10-02');
    fireEvent.change(screen.getByLabelText(/^Fecha Cliente/), { target: { value: '2026-10-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }));

    await waitFor(() => expect(m.patchTask).toHaveBeenCalledWith('t1', expect.objectContaining({ fecha_cliente: '2026-10-03' })));
  });
});

describe('Tasks · orden y filtro por proyecto', () => {
  const filtro = (prefijo: string) => screen.getAllByRole('combobox').find((c) => c.textContent?.startsWith(prefijo)) as HTMLElement;
  async function elegirEnFiltro(combo: HTMLElement, opcion: string) {
    fireEvent.keyDown(combo, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: opcion }));
    await act(async () => {});
  }

  it('pide las tareas ordenadas por fecha de entrega', async () => {
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    expect(m.getTasks).toHaveBeenCalledWith(expect.objectContaining({ orden: 'entrega' }));
  });

  it('con una marca elegida filtra por proyecto; al cambiar de marca el proyecto vuelve a "todos"', async () => {
    m.getProjects.mockResolvedValue([{ id: 'p1', nombre: 'Portal' }]);
    renderTasks();
    await screen.findByText('Carrusel de lanzamiento');
    expect(screen.getByRole('combobox', { name: 'Proyecto' })).toBeDisabled();
    await elegirEnFiltro(filtro('Marca:'), 'Dinatek');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Proyecto' })).toBeEnabled());
    await elegirEnFiltro(screen.getByRole('combobox', { name: 'Proyecto' }), 'Portal');
    await waitFor(() => expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ brand_id: 'b1', project_id: 'p1' })));
    await elegirEnFiltro(filtro('Marca:'), 'Pronaca');
    await waitFor(() => expect(m.getTasks).toHaveBeenLastCalledWith(expect.objectContaining({ brand_id: 'b2', project_id: 'all' })));
  });
});

