import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import { NuevoProyectoDialog } from './NuevoProyectoDialog';

vi.mock('@/lib/apiClient', () => ({ createProject: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const MARCAS = [{ id: 'b1', nombre: 'Alba del Bosque' }];
const PERSONAS = [{ id: 'u1', nombre: 'Even Fierro' }, { id: 'u2', nombre: 'Ana Mora' }];

beforeEach(() => { vi.clearAllMocks(); });

describe('NuevoProyectoDialog', () => {
  it('no deja crear sin marca, nombre y líder; crea el proyecto con su líder', async () => {
    vi.mocked(api.createProject).mockResolvedValue({ id: 'p1' } as never);
    const onCreado = vi.fn();
    render(<NuevoProyectoDialog abierto onOpenChange={() => {}} marcas={MARCAS} personas={PERSONAS} onCreado={onCreado} />);
    const crear = screen.getByRole('button', { name: 'Crear' });
    fireEvent.change(screen.getByLabelText('Cliente / Marca *'), { target: { value: 'b1' } });
    fireEvent.change(screen.getByLabelText('Nombre del proyecto *'), { target: { value: 'Bot Proyecta' } });
    expect(crear).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Líder del proyecto *'), { target: { value: 'u2' } });
    expect(crear).toBeEnabled();
    fireEvent.click(crear);
    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith({ brand_id: 'b1', nombre: 'Bot Proyecta', lider_user_id: 'u2', fecha_inicio: undefined, fecha_fin: undefined }));
    expect(onCreado).toHaveBeenCalled();
  });

  it('explica para qué sirve el líder, con tuteo', () => {
    render(<NuevoProyectoDialog abierto onOpenChange={() => {}} marcas={MARCAS} personas={PERSONAS} onCreado={() => {}} />);
    expect(screen.getByText('Agrupa las tareas de un cliente en un proyecto. El líder recibe y aprueba sus reportes.')).toBeInTheDocument();
  });
});
