import { describe, it, expect } from 'vitest';
import { sinHtmlVacio } from '../src/utils/html.js';

describe('sinHtmlVacio', () => {
  it('convierte en null el HTML que el editor deja cuando no hay nada escrito', () => {
    expect(sinHtmlVacio('<p></p>')).toBeNull();
    expect(sinHtmlVacio('<p></p><p></p>')).toBeNull();
    expect(sinHtmlVacio(' <p><br></p> ')).toBeNull();
    expect(sinHtmlVacio('<p><br/></p>')).toBeNull();
    expect(sinHtmlVacio('')).toBeNull();
    expect(sinHtmlVacio('   ')).toBeNull();
  });

  it('deja intacto lo que sí tiene contenido, aunque sea solo una imagen', () => {
    expect(sinHtmlVacio('<p>Hola</p>')).toBe('<p>Hola</p>');
    expect(sinHtmlVacio('<p></p><img src="https://tiusdei.qbit.ec/uploads/editor/a.png">')).toBe('<p></p><img src="https://tiusdei.qbit.ec/uploads/editor/a.png">');
    expect(sinHtmlVacio('texto plano')).toBe('texto plano');
  });

  it('respeta null y undefined (undefined significa "no tocar el campo")', () => {
    expect(sinHtmlVacio(null)).toBeNull();
    expect(sinHtmlVacio(undefined)).toBeUndefined();
  });
});
