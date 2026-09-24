import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTareaDesdeMinuta } from './useTareaDesdeMinuta';
import { urlNuevaTareaDesdePunto } from '@/lib/tareaDesdePunto';
import * as minutasApi from '@/lib/minutasApi';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));
vi.mock('@/lib/minutasApi', () => ({ vincularTarea: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const conRuta = (url: string) => ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

describe('useTareaDesdeMinuta', () => {
  beforeEach(() => { navigate.mockReset(); vi.mocked(minutasApi.vincularTarea).mockReset().mockResolvedValue({} as never); });

  it('abre el formulario prellenado y, al crear, vincula la tarea y vuelve a la minuta', async () => {
    const url = urlNuevaTareaDesdePunto({
      brandId: 'b1', projectId: null, titulo: 'Botón de WhatsApp', detalle: 'Origen: Dinatek M-03, punto 3.4.',
      fechaEntrega: null, minutaItemId: 'i4', minutaId: 'm3',
    });
    const abrir = vi.fn();
    const { result } = renderHook(() => useTareaDesdeMinuta(abrir), { wrapper: conRuta(url) });
    await waitFor(() => expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ titulo_tarea: 'Botón de WhatsApp', brand_id: 'b1' })));
    await result.current.alCrearTarea('t1');
    expect(minutasApi.vincularTarea).toHaveBeenCalledWith('i4', 't1');
    expect(navigate).toHaveBeenCalledWith('/minutas/m3');
  });

  it('sin parámetros no abre nada ni vincula', async () => {
    const abrir = vi.fn();
    const { result } = renderHook(() => useTareaDesdeMinuta(abrir), { wrapper: conRuta('/tareas') });
    await result.current.alCrearTarea('t1');
    expect(abrir).not.toHaveBeenCalled();
    expect(minutasApi.vincularTarea).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
