import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as api from '@/lib/apiClient';
import { FiltroProyecto } from './FiltroProyecto';

vi.mock('@/lib/apiClient', () => ({ getProjects: vi.fn() }));

beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); Element.prototype.hasPointerCapture = vi.fn(() => false); });

describe('FiltroProyecto', () => {
  beforeEach(() => { vi.mocked(api.getProjects).mockReset().mockResolvedValue([{ id: 'p1', nombre: 'Portal' }, { id: 'p2', nombre: 'App' }] as never); });

  it('sin marca elegida dice "Todos" y está desactivado', () => {
    render(<FiltroProyecto brandId="all" value="all" onChange={vi.fn()} />);
    const filtro = screen.getByRole('combobox', { name: /Proyecto/ });
    expect(filtro).toBeDisabled();
    expect(filtro).toHaveTextContent('Proyecto:Todos');
    expect(api.getProjects).not.toHaveBeenCalled();
  });

  it('con marca ofrece sus proyectos y avisa el elegido', async () => {
    const onChange = vi.fn();
    render(<FiltroProyecto brandId="b1" value="all" onChange={onChange} />);
    await waitFor(() => expect(api.getProjects).toHaveBeenCalledWith({ brand_id: 'b1' }));
    const filtro = screen.getByRole('combobox', { name: /Proyecto/ });
    expect(filtro).toBeEnabled();
    fireEvent.keyDown(filtro, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'Portal' }));
    expect(onChange).toHaveBeenCalledWith('p1');
  });
});
