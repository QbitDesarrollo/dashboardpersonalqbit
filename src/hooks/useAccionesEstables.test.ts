import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAccionesEstables } from './useAccionesEstables';

describe('useAccionesEstables', () => {
  it('devuelve el mismo objeto en cada render, pero siempre llama a la versión más reciente', () => {
    const primera = vi.fn();
    const segunda = vi.fn();
    const { result, rerender } = renderHook(({ fn }) => useAccionesEstables({ abrir: fn }), { initialProps: { fn: primera } });
    const inicial = result.current;

    rerender({ fn: segunda });
    expect(result.current).toBe(inicial);
    expect(result.current.abrir).toBe(inicial.abrir);

    result.current.abrir('t1', 2);
    expect(segunda).toHaveBeenCalledWith('t1', 2);
    expect(primera).not.toHaveBeenCalled();
  });

  it('devuelve lo que devuelve la acción', () => {
    const { result } = renderHook(() => useAccionesEstables({ sumar: (a: number, b: number) => a + b }));
    expect(result.current.sumar(2, 3)).toBe(5);
  });
});
