import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTasks } from './apiClient';

describe('getTasks', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset().mockResolvedValue(new Response('{"tasks":[],"total":0}')); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('pide el orden por fecha de entrega y filtra por proyecto', async () => {
    await getTasks({ brand_id: 'b1', project_id: 'p1', orden: 'entrega' });
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://x');
    expect(url.searchParams.get('project_id')).toBe('p1');
    expect(url.searchParams.get('orden')).toBe('entrega');
  });

  it('no manda el proyecto cuando es "todos"', async () => {
    await getTasks({ project_id: 'all' });
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('project_id');
  });
});
