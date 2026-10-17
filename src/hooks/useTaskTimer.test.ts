import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useTaskTimer } from './useTaskTimer';

vi.mock('@/lib/apiClient', () => ({ getActiveTimers: vi.fn(), patchTask: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-17T14:00:00.000Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useTaskTimer', () => {
  it('catches up to wall time after interval callbacks were suspended', () => {
    const { result } = renderHook(() => useTaskTimer({
      taskId: 'task-a', initialTime: 3600, isActive: true,
      startTime: '2026-10-17T14:00:00.000Z',
    }));
    expect(result.current.elapsedTime).toBe(3600);
    act(() => {
      vi.setSystemTime(new Date('2026-10-17T14:02:00.000Z'));
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.elapsedTime).toBe(3721);
  });

  it('keeps the saved time if the server has an invalid start timestamp', () => {
    const { result } = renderHook(() => useTaskTimer({
      taskId: 'task-a', initialTime: 3600, isActive: true, startTime: 'invalid',
    }));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.elapsedTime).toBe(3600);
    expect(result.current.formattedTime).toBe('01:00:00');
  });
});
