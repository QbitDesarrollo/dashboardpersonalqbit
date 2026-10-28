import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import * as api from './api';
import { IntegracionesCard } from './IntegracionesCard';

vi.mock('./api', () => ({ obtenerPermisosGoogle: vi.fn(), revocarConexionGoogle: vi.fn(), conectarGoogle: vi.fn() }));
const sinPermisos = { conectado: false, calendar: false, drive: false, chat: false };
const todos = { conectado: true, calendar: true, drive: true, chat: true };

beforeEach(() => vi.resetAllMocks());

describe('Integraciones personales', () => {
  it('distingue los permisos por servicio y ofrece dar permiso', async () => {
    vi.mocked(api.obtenerPermisosGoogle).mockResolvedValue({ ...todos, calendar: false });
    render(<IntegracionesCard />);
    const row = (await screen.findByText('Google Calendar')).closest('li')!;
    expect(within(row).getByText('Falta permiso')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: /Dar permiso/ }));
    expect(api.conectarGoogle).toHaveBeenCalledOnce();
    expect(screen.getAllByText('Conectado')).toHaveLength(2);
    expect(screen.getByText('Ve tus reuniones en Tiusdei')).toBeTruthy();
    expect(screen.getByText('Adjunta archivos de Drive a tus tareas')).toBeTruthy();
    expect(screen.getByText('Recibe avisos de tus tareas y reuniones')).toBeTruthy();
  });

  it('sin token muestra Conectar para los tres servicios', async () => {
    vi.mocked(api.obtenerPermisosGoogle).mockResolvedValue(sinPermisos);
    render(<IntegracionesCard />);
    expect(await screen.findAllByText('No conectado')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar: Google Calendar' }));
    expect(api.conectarGoogle).toHaveBeenCalledOnce();
  });

  it('pide confirmar y permite cancelar antes de revocar toda la conexión', async () => {
    vi.mocked(api.obtenerPermisosGoogle).mockResolvedValue(todos);
    vi.mocked(api.revocarConexionGoogle).mockResolvedValue(sinPermisos);
    render(<IntegracionesCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revocar: Google Drive' }));
    expect(api.revocarConexionGoogle).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(api.revocarConexionGoogle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Revocar: Google Drive' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Calendar, Drive y Chat/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revocar conexión' }));
    expect(await screen.findAllByText('No conectado')).toHaveLength(3);
    expect(api.revocarConexionGoogle).toHaveBeenCalledOnce();
  });

  it('un error de consulta no se presenta como desconexión y permite reintentar', async () => {
    vi.mocked(api.obtenerPermisosGoogle).mockRejectedValueOnce(new Error('Sin red')).mockResolvedValueOnce(todos);
    render(<IntegracionesCard />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('No conectado')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findAllByText('Conectado')).toHaveLength(3);
  });

  it('conserva los permisos si falla la revocación', async () => {
    vi.mocked(api.obtenerPermisosGoogle).mockResolvedValue(todos);
    vi.mocked(api.revocarConexionGoogle).mockRejectedValue(new Error('No se pudo revocar'));
    render(<IntegracionesCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revocar: Google Calendar' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revocar conexión' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se pudo revocar'));
    expect(screen.getAllByText('Conectado')).toHaveLength(3);
  });
});
