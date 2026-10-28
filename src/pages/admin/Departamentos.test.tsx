import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import Departamentos from './Departamentos';

const sesion = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => sesion }));
vi.mock('@/lib/apiClient', () => ({ apiRequest: vi.fn(), createDepartment: vi.fn(), patchDepartment: vi.fn() }));
const filas = [
  { id: 'a', nombre: 'Contenido', orden: 10, color: '#14b8a6', next_department_id: 'b', next_department_nombre: 'Diseño', activo: true, personas: 3, tareas_abiertas: 4, tareas_total: 8, canales: ['Mesa 1'] },
  { id: 'b', nombre: 'Diseño', orden: 20, color: null, next_department_id: null, next_department_nombre: null, activo: true, personas: 0, tareas_abiertas: 0, tareas_total: 0, canales: [] },
  { id: 'c', nombre: 'Fotografía', orden: 30, color: null, next_department_id: null, next_department_nombre: null, activo: false, personas: 0, tareas_abiertas: 0, tareas_total: 0, canales: [] },
];
beforeEach(() => {
  vi.clearAllMocks();
  sesion.isAdmin = true;
  vi.mocked(api.apiRequest).mockImplementation(async path => respuesta(path.endsWith('/referencias') ? { ...referenciasVacias, personas: 3, mesas: 1 } : filas));
  vi.mocked(api.createDepartment).mockResolvedValue(filas[0]);
  vi.mocked(api.patchDepartment).mockResolvedValue(filas[0]);
});

const referenciasVacias = { tareas: 0, historial: 0, traspasos: 0, plantillas: 0, personas: 0, mesas: 0, etapas: 0 };
const respuesta = (datos: unknown, ok = true) => ({ ok, json: async () => datos }) as Response;

async function abrirEliminar(referencias = referenciasVacias) {
  vi.mocked(api.apiRequest).mockImplementation(async path => respuesta(path.endsWith('/referencias') ? referencias : filas));
  render(<Departamentos />);
  await screen.findByText('Contenido');
  fireEvent.click(screen.getByRole('tab', { name: 'Archivados (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente Fotografía' }));
  return within(await screen.findByRole('alertdialog'));
}

describe('Departamentos · S9', () => {
  it('archiva moviendo al siguiente activo por defecto y muestra el alcance', async () => {
    render(<Departamentos />); await screen.findByText('Contenido');
    fireEvent.click(screen.getByRole('button', { name: 'Archivar Contenido' }));
    const d = within(screen.getByRole('alertdialog'));
    expect(d.getByRole('heading', { name: 'Archivar Contenido' })).toBeInTheDocument();
    expect(d.getByLabelText('Departamento de destino')).toHaveValue('b');
    expect(d.queryByRole('option', { name: 'Contenido' })).not.toBeInTheDocument();
    expect(d.queryByRole('option', { name: 'Fotografía' })).not.toBeInTheDocument();
    expect(await d.findByText('4 tareas abiertas · 3 personas · 1 mesas')).toBeInTheDocument();
    expect(d.getByText(/el historial y los reportes se conservan/i)).toBeInTheDocument();
    fireEvent.click(d.getByRole('button', { name: 'Archivar' }));
    await waitFor(() => expect(api.apiRequest).toHaveBeenCalledWith('/api/data/departments/a/archivar', { method: 'POST', body: JSON.stringify({ destino_id: 'b' }) }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
  it('permite dejar sin departamento, conserva error inline y reintenta', async () => {
    vi.mocked(api.apiRequest).mockImplementation(async (path) => respuesta(path.endsWith('/archivar') ? { error: 'El destino debe estar activo' } : path.endsWith('/referencias') ? referenciasVacias : filas, !path.endsWith('/archivar')));
    render(<Departamentos />); await screen.findByText('Contenido');
    fireEvent.click(screen.getByRole('button', { name: 'Archivar Contenido' }));
    const d = within(screen.getByRole('alertdialog'));
    fireEvent.click(d.getByLabelText('Dejarlas sin departamento'));
    await waitFor(() => expect(d.getByRole('button', { name: 'Archivar' })).toBeEnabled());
    fireEvent.click(d.getByRole('button', { name: 'Archivar' }));
    expect(await d.findByRole('alert')).toHaveTextContent('El destino debe estar activo');
    expect(api.apiRequest).toHaveBeenCalledWith('/api/data/departments/a/archivar', { method: 'POST', body: JSON.stringify({ destino_id: null }) });
    expect(d.getByLabelText('Dejarlas sin departamento')).toBeChecked();
    expect(d.getByRole('button', { name: 'Archivar' })).toBeEnabled();
    fireEvent.click(d.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  it('previsualiza también personas inactivas porque el archivo mueve todos los perfiles', async () => {
    vi.mocked(api.apiRequest).mockImplementation(async path => respuesta(path.endsWith('/referencias') ? { ...referenciasVacias, personas: 5, mesas: 2 } : filas));
    render(<Departamentos />); await screen.findByText('Contenido');
    fireEvent.click(screen.getByRole('button', { name: 'Archivar Contenido' }));
    const d = within(screen.getByRole('alertdialog'));
    expect(await d.findByText('4 tareas abiertas · 5 personas · 2 mesas')).toBeInTheDocument();
  });
  it('restaura y explica que lo movido no regresa', async () => {
    render(<Departamentos />); await screen.findByText('Contenido');
    fireEvent.click(screen.getByRole('tab', { name: 'Archivados (1)' }));
    expect(screen.getByText(/Los elementos movidos se quedan donde están/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar Fotografía' }));
    await waitFor(() => expect(api.apiRequest).toHaveBeenCalledWith('/api/data/departments/c/restaurar', { method: 'POST' }));
  });
  it('lista todas las referencias y solo permite Entendido si está bloqueado', async () => {
    const d = await abrirEliminar({ tareas: 2, historial: 5, traspasos: 1, plantillas: 3, personas: 4, mesas: 2, etapas: 1 });
    await d.findByText('Déjalo archivado: no molesta y conserva los reportes.');
    for (const texto of ['2 tareas', '5 registros de historial', '1 traspasos', '3 plantillas', '4 personas', '2 mesas', '1 etapas']) expect(d.getByText(texto)).toBeInTheDocument();
    expect(d.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(d.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(vi.mocked(api.apiRequest).mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  });
  it('exige nombre exacto (incluye mayúsculas y espacios) antes del DELETE', async () => {
    const d = await abrirEliminar();
    const input = await d.findByLabelText('Escribe Fotografía para confirmar');
    const eliminar = d.getByRole('button', { name: 'Eliminar' });
    for (const nombre of ['', 'fotografía', 'Fotografía ']) {
      fireEvent.change(input, { target: { value: nombre } }); expect(eliminar).toBeDisabled();
    }
    fireEvent.change(input, { target: { value: 'Fotografía' } }); expect(eliminar).toBeEnabled();
    fireEvent.click(eliminar);
    await waitFor(() => expect(api.apiRequest).toHaveBeenCalledWith('/api/data/departments/c', { method: 'DELETE', body: JSON.stringify({ confirmacion: 'Fotografía' }) }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
  it('reconcilia referencias concurrentes devueltas por DELETE sin cerrar el diálogo', async () => {
    const d = await abrirEliminar();
    const input = await d.findByLabelText('Escribe Fotografía para confirmar');
    vi.mocked(api.apiRequest).mockResolvedValue(respuesta({ error: 'El departamento tiene referencias', referencias: { ...referenciasVacias, historial: 1 } }, false));
    fireEvent.change(input, { target: { value: 'Fotografía' } });
    fireEvent.click(d.getByRole('button', { name: 'Eliminar' }));
    expect(await d.findByRole('alert')).toHaveTextContent('El departamento tiene referencias');
    expect(d.getByText('1 registros de historial')).toBeInTheDocument();
    expect(d.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});

describe('Departamentos · S8', () => {
  it('admin conserva columnas, conteos, crear, editar y reordenar', async () => {
    render(<Departamentos />);
    await screen.findByText('Contenido');
    expect(api.apiRequest).toHaveBeenCalledWith('/api/data/departments/resumen');
    expect(screen.getByRole('button', { name: 'Nuevo departamento' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Contenido' })).toBeInTheDocument();
    expect(screen.getByText('4 abiertas / 8')).toBeInTheDocument();
    expect(screen.getByText('Canal: Mesa 1')).toBeInTheDocument();
    expect(screen.getByText('Solo administradores pueden crear y editar')).toBeInTheDocument();
    for (const columna of ['Orden', 'Departamento', 'Sigue', 'Personas', 'Tareas', 'Canal de mesa', 'Estado', 'Acciones']) {
      expect(screen.getByRole('columnheader', { name: columna })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Archivar Contenido' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Contenido' }));
    await waitFor(() => expect(api.patchDepartment).toHaveBeenCalledWith('b', { orden: 10 }));
    expect(api.patchDepartment).toHaveBeenCalledWith('a', { orden: 20 });
  });
  it('ejecutivo ve la tabla sin controles de mutación', async () => {
    sesion.isAdmin = false;
    render(<Departamentos />);
    await screen.findByText('Contenido');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nuevo departamento|editar|subir|bajar|archivar|restaurar|eliminar/i })).not.toBeInTheDocument();
    expect(api.patchDepartment).not.toHaveBeenCalled();
    expect(api.createDepartment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Archivados (1)' }));
    expect(screen.queryByRole('button', { name: /restaurar|eliminar/i })).not.toBeInTheDocument();
  });
  it('separa activos y archivados mediante activo', async () => {
    render(<Departamentos />);
    await screen.findByText('Contenido');
    expect(screen.getByRole('tab', { name: 'Activos (2)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Fotografía')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Archivados (1)' }));
    expect(screen.getByText('Fotografía')).toBeInTheDocument();
    expect(screen.queryByText('Contenido')).not.toBeInTheDocument();
    expect(screen.getByText('Archivado')).toBeInTheDocument();
  });
  it('muestra el mensaje exacto de duplicado inline y conserva el diálogo y los datos', async () => {
    vi.mocked(api.createDepartment).mockRejectedValue(new Error('{"error":"Ya existe un departamento con ese nombre"}'));
    render(<Departamentos />);
    await screen.findByText('Contenido');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo departamento' }));
    const dialogo = within(screen.getByRole('dialog'));
    fireEvent.change(dialogo.getByLabelText('Nombre'), { target: { value: 'Contenido' } });
    fireEvent.click(dialogo.getByRole('button', { name: 'Crear' }));
    expect(await dialogo.findByRole('alert')).toHaveTextContent(/^Ya existe un departamento con ese nombre$/);
    expect(dialogo.getByLabelText('Nombre')).toHaveValue('Contenido');
    expect(api.apiRequest).toHaveBeenCalledTimes(1);
    expect(api.patchDepartment).not.toHaveBeenCalled();
  });
  it('edita los campos existentes y excluye la propia etapa del selector', async () => {
    render(<Departamentos />);
    await screen.findByText('Contenido');
    fireEvent.click(screen.getByRole('button', { name: 'Editar Contenido' }));
    const dialogo = within(screen.getByRole('dialog'));
    expect(dialogo.getByLabelText('Nombre')).toHaveValue('Contenido');
    expect(dialogo.queryByRole('option', { name: 'Contenido' })).not.toBeInTheDocument();
    fireEvent.change(dialogo.getByLabelText('Nombre'), { target: { value: 'Contenido nuevo' } });
    fireEvent.click(dialogo.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.patchDepartment).toHaveBeenCalledWith('a', { nombre: 'Contenido nuevo', color: '#14b8a6', next_department_id: 'b', orden: 10 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
