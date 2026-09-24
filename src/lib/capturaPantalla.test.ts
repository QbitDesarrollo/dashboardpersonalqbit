import { describe, it, expect } from 'vitest';
import { fueraDeLaVista } from './capturaPantalla';

const con = (r: { top: number; left: number; width: number; height: number }, tag = 'DIV') => {
  const el = document.createElement(tag);
  el.getBoundingClientRect = () => ({ ...r, bottom: r.top + r.height, right: r.left + r.width, x: r.left, y: r.top, toJSON: () => r }) as DOMRect;
  return el;
};

describe('fueraDeLaVista', () => {
  it('salta lo que está completamente fuera de la pantalla', () => {
    expect(fueraDeLaVista(con({ top: 950, left: 0, width: 800, height: 40 }), 1440, 900)).toBe(true);
    expect(fueraDeLaVista(con({ top: -80, left: 0, width: 800, height: 40 }), 1440, 900)).toBe(true);
    expect(fueraDeLaVista(con({ top: 10, left: 1500, width: 100, height: 40 }), 1440, 900)).toBe(true);
  });

  it('conserva lo que se ve, aunque sea en parte', () => {
    expect(fueraDeLaVista(con({ top: 880, left: 0, width: 800, height: 40 }), 1440, 900)).toBe(false);
    expect(fueraDeLaVista(con({ top: 0, left: 0, width: 1440, height: 5000 }), 1440, 900)).toBe(false);
  });

  it('conserva los contenedores sin tamaño: sus hijos pueden verse', () => {
    expect(fueraDeLaVista(con({ top: 2000, left: 0, width: 0, height: 0 }), 1440, 900)).toBe(false);
  });

  it('salta los scripts, que no se dibujan', () => {
    expect(fueraDeLaVista(con({ top: 0, left: 0, width: 0, height: 0 }, 'SCRIPT'), 1440, 900)).toBe(true);
  });
});
