import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import html2canvas from 'html2canvas';
import { useScreenshotCapture } from './useScreenshotCapture';

vi.mock('html2canvas', () => ({ default: vi.fn(async () => ({ toDataURL: () => 'data:image/jpeg;base64,xx' })) }));
vi.mock('@/lib/apiClient', () => ({ uploadScreenshot: vi.fn(async () => ({})) }));

beforeEach(() => { vi.useFakeTimers(); vi.mocked(html2canvas).mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe('useScreenshotCapture', () => {
  it('al capturar salta lo que está fuera de la pantalla, para no congelar el navegador', async () => {
    renderHook(() => useScreenshotCapture('s1', 't1', 5));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(html2canvas).toHaveBeenCalledTimes(1);
    const { ignoreElements } = vi.mocked(html2canvas).mock.calls[0][1] as { ignoreElements: (el: Element) => boolean };
    const abajo = document.createElement('tr');
    abajo.getBoundingClientRect = () => ({ top: innerHeight + 50, bottom: innerHeight + 90, left: 0, right: 500, width: 500, height: 40 }) as DOMRect;
    const visible = document.createElement('div');
    visible.getBoundingClientRect = () => ({ top: 10, bottom: 50, left: 0, right: 500, width: 500, height: 40 }) as DOMRect;
    expect(ignoreElements(abajo)).toBe(true);
    expect(ignoreElements(visible)).toBe(false);
  });
});
