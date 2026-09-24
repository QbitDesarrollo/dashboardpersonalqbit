import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import { TaskFiles } from './TaskFiles';

vi.mock('@/lib/apiClient', () => ({ getFiles: vi.fn(), createFile: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/components/drive/DriveFilePicker', () => ({ DriveFilePicker: () => null }));
vi.mock('@/components/drive/DriveFileList', () => ({ DriveFileList: () => null }));

const ARCHIVOS = [{ id: 'f1', nombre_archivo: 'brief.pdf', url_storage: '/uploads/tasks/brief.pdf', created_at: '2026-09-24T10:00:00Z' }];

describe('TaskFiles compacto (fila de Tareas)', () => {
  beforeEach(() => { vi.mocked(api.getFiles).mockReset().mockResolvedValue(ARCHIVOS as never); });

  it('con el conteo de la lista no pide nada al cargar y muestra el número', () => {
    render(<TaskFiles taskId="t1" canEdit compact conteoInicial={3} />);
    expect(api.getFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveTextContent('3');
  });

  it('pide los archivos recién al abrirlo', async () => {
    render(<TaskFiles taskId="t1" canEdit compact conteoInicial={1} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(api.getFiles).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('brief.pdf')).toBeInTheDocument();
  });

  it('sin conteo se comporta como antes: los pide al cargar', async () => {
    render(<TaskFiles taskId="t1" canEdit compact />);
    await waitFor(() => expect(api.getFiles).toHaveBeenCalledWith('t1'));
  });
});
