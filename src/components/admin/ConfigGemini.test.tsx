import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { ConfigGemini } from './ConfigGemini';

vi.mock('@/lib/apiClient', () => ({ patchSiteSettings: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('ConfigGemini', () => {
  beforeEach(() => {
    vi.mocked(api.patchSiteSettings).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('muestra si Gemini está habilitado y guarda el cambio', async () => {
    const onGuardado = vi.fn();
    render(<ConfigGemini ajustes={{ gemini_enabled: 'false' }} onGuardado={onGuardado} />);
    const interruptor = screen.getByRole('switch', { name: 'Gemini AI habilitado' });
    expect(interruptor).not.toBeChecked();
    expect(screen.getByText('El asistente Gemini está oculto para todos los usuarios')).toBeInTheDocument();
    fireEvent.click(interruptor);
    expect(screen.getByText('Los usuarios verán el botón de Gemini y podrán interactuar con el asistente AI')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración de Gemini' }));
    await waitFor(() => expect(api.patchSiteSettings).toHaveBeenCalledWith({ gemini_enabled: 'true' }));
    expect(toast.success).toHaveBeenCalledWith('Configuración de Gemini guardada');
    expect(onGuardado).toHaveBeenCalled();
  });

  it('parte habilitado si el ajuste lo está', () => {
    render(<ConfigGemini ajustes={{ gemini_enabled: 'true' }} onGuardado={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Gemini AI habilitado' })).toBeChecked();
  });

  it('si falla al guardar, lo dice', async () => {
    vi.mocked(api.patchSiteSettings).mockRejectedValue(new Error('Sin conexión'));
    render(<ConfigGemini ajustes={{}} onGuardado={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración de Gemini' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error', { description: 'Sin conexión' }));
  });
});
