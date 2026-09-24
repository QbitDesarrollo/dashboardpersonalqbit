import { useLayoutEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Acciones<T> = { [K in keyof T]: (...args: any[]) => any };

/**
 * Handlers that keep the same identity across renders but always run the latest version.
 * Lets memoized list rows receive callbacks without redrawing every time the page renders.
 * The set of keys is fixed on the first render.
 */
export function useAccionesEstables<T extends Acciones<T>>(acciones: T): T {
  const actuales = useRef(acciones);
  useLayoutEffect(() => { actuales.current = acciones; });
  const [estables] = useState(() => Object.fromEntries(
    Object.keys(acciones).map((clave) => [clave, (...args: unknown[]) => actuales.current[clave as keyof T](...args)]),
  ) as T);
  return estables;
}
