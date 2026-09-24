import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import * as ia from '@/lib/minutasIaApi';
import { ConfigMinutasIa } from './ConfigMinutasIa';

vi.mock('@/lib/apiClient', () => ({ patchSiteSettings: vi.fn() }));
vi.mock('@/lib/minutasIaApi', () => ({ saludIa: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const DESKS = [
  { id: 'd1', nombre: 'Desarrollo', activo: true },
  { id: 'd2', nombre: 'Pycca', activo: true },
  { id: 'd3', nombre: 'Contenido', activo: true },
  { id: 'd4', nombre: 'Archivada', activo: false },
];

function montar(ajustes: Record<string, string | undefined> = { ia_minutas_desk_ids: 'd1', ia_minutas_limite_diario: '10' }) {
  const onGuardado = vi.fn();
  render(<ConfigMinutasIa desks={DESKS} ajustes={ajustes} onGuardado={onGuardado} />);
  return onGuardado;
}

describe('ConfigMinutasIa', () => {
  beforeEach(() => {
    vi.mocked(api.patchSiteSettings).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(ia.saludIa).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('muestra las mesas activas marcadas según la configuración y el límite diario', () => {
    montar();
    expect(screen.getByRole('switch', { name: 'Desarrollo' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Pycca' })).not.toBeChecked();
    expect(screen.queryByRole('switch', { name: 'Archivada' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Minutas por persona al día')).toHaveValue(10);
  });

  it('guarda las mesas elegidas y el límite', async () => {
    const onGuardado = montar();
    fireEvent.click(screen.getByRole('switch', { name: 'Contenido' }));
    fireEvent.change(screen.getByLabelText('Minutas por persona al día'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.patchSiteSettings).toHaveBeenCalledWith({ ia_minutas_desk_ids: 'd1,d3', ia_minutas_limite_diario: '5' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Minutas con IA: configuración guardada'));
    expect(onGuardado).toHaveBeenCalled();
  });

  it('avisa que nadie puede usarla si no hay mesas elegidas', () => {
    montar({});
    expect(screen.getByText('Nadie puede usarla hasta que elijas al menos una mesa.')).toBeInTheDocument();
    expect(screen.getByLabelText('Minutas por persona al día')).toHaveValue(10);
  });

  it('si el servidor rechaza los datos, lo dice', async () => {
    vi.mocked(api.patchSiteSettings).mockResolvedValue({ error: 'Datos inválidos' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo guardar', { description: 'Datos inválidos' }));
  });

  it('prueba la conexión con Codex y muestra el resultado', async () => {
    vi.mocked(ia.saludIa).mockResolvedValueOnce({ listo: true, detalle: 'Logged in using ChatGPT' }).mockResolvedValueOnce({ listo: false, detalle: 'Not logged in' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    expect(await screen.findByText('Codex está listo · Logged in using ChatGPT')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    expect(await screen.findByText('Codex no está listo · Not logged in')).toBeInTheDocument();
  });
});
