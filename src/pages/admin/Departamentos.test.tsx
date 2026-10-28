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
  vi.mocked(api.apiRequest).mockResolvedValue({ ok: true, json: async () => filas } as Response);
  vi.mocked(api.createDepartment).mockResolvedValue(filas[0]);
  vi.mocked(api.patchDepartment).mockResolvedValue(filas[0]);
});

describe('Departamentos · S8', () => {
  it('admin ve columnas, conteos, crear, editar y reordenar, sin acciones de S9', async () => {
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
    expect(screen.queryByRole('button', { name: /archivar|eliminar|restaurar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Contenido' }));
    await waitFor(() => expect(api.patchDepartment).toHaveBeenCalledWith('b', { orden: 10 }));
    expect(api.patchDepartment).toHaveBeenCalledWith('a', { orden: 20 });
  });
  it('ejecutivo ve la tabla sin controles de mutación', async () => {
    sesion.isAdmin = false;
    render(<Departamentos />);
    await screen.findByText('Contenido');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nuevo departamento|editar|subir|bajar/i })).not.toBeInTheDocument();
    expect(api.patchDepartment).not.toHaveBeenCalled();
    expect(api.createDepartment).not.toHaveBeenCalled();
  });
  it('separa activos y archivados mediante activo, sin acciones de archivo', async () => {
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
