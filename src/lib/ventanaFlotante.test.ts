import { beforeEach, describe, expect, it } from 'vitest';
import { soportada, leerPreferencia, guardarPreferencia, limitarTamano, leerTamano, guardarTamano, entregaFlotante, subtareaLista, textoPreview, alturaFlotante } from './ventanaFlotante';

beforeEach(() => localStorage.clear());
describe('ventana flotante', () => {
  it('extracts plain text from HTML, lists and empty editor content', () => {
    expect(textoPreview('<p>Revisar <strong>copy</strong> &amp; diseño.</p>')).toBe('Revisar copy & diseño.');
    expect(textoPreview('<ul><li>Primero</li><li>Segundo&nbsp; paso</li></ul>')).toBe('Primero Segundo paso');
    expect(textoPreview('<script>alert(1)</script><style>p{}</style><p> Texto   limpio </p>')).toBe('Texto limpio');
    expect(textoPreview('<p>&lt;img src=x&gt;</p>')).toBe('<img src=x>');
    expect(textoPreview('<p><br></p>')).toBe('');
    expect(textoPreview(null)).toBe('');
  });
  it('sizes optional rows without reserving blank space', () => {
    expect(alturaFlotante({})).toBe(160);
    expect(alturaFlotante({ descripcion: true })).toBe(204);
    expect(alturaFlotante({ personas: true, estimacion: true })).toBe(200);
    expect(alturaFlotante({ descripcion: true, personas: true, reunion: true, estimacion: true })).toBe(276);
  });
  it('uses Ecuador dates for delivery and existing done states for subtasks', () => {
    expect(entregaFlotante('2026-10-27 00:00:00', Date.parse('2026-10-28T01:00:00Z'))).toBe('Entrega hoy');
    expect(entregaFlotante('2026-10-27', Date.parse('2026-10-27T15:00:00Z'))).toBe('Entrega hoy');
    expect(subtareaLista({ estado: 'aprobado' })).toBe(true);
    expect(subtareaLista({ estado: 'entregado' })).toBe(true);
    expect(subtareaLista({ check_done: true })).toBe(true);
    expect(subtareaLista({ estado: 'en_proceso' })).toBe(false);
  });
  it('labels civil due dates without times or timezone shifts', () => {
    const now = Date.parse('2025-10-28T02:00:00Z');
    expect(entregaFlotante('2025-09-25T00:00:00Z', now)).toBe('Vencida · 25 sept');
    expect(entregaFlotante('2025-10-28', now)).toBe('Entrega mañana');
    expect(entregaFlotante('2025-10-30', now)).toBe('Entrega jue 30 oct');
    expect(entregaFlotante('2026-01-01', Date.parse('2025-12-31T17:00:00Z'))).toBe('Entrega mañana');
    expect(entregaFlotante('2025-10-27', Date.parse('2025-10-28T05:00:00Z'))).toBe('Vencida · 27 oct');
  });
  it('requires the API and a top-level window', () => {
    expect(soportada(window)).toBe(false);
    const top = {};
    expect(soportada({ self: top, top, documentPictureInPicture: {} })).toBe(true);
    expect(soportada({ self: {}, top, documentPictureInPicture: {} })).toBe(false);
  });
  it('defaults ON and persists both choices', () => {
    expect(leerPreferencia(localStorage)).toBe(true);
    guardarPreferencia(localStorage, false);
    expect(leerPreferencia(localStorage)).toBe(false);
    guardarPreferencia(localStorage, true);
    expect(leerPreferencia(localStorage)).toBe(true);
  });
  it('discards oversized remembered dimensions and defaults to a compact window', () => {
    expect(leerTamano(localStorage)).toEqual({ width: 320, height: 210 });
    for (const size of [{ width: 481, height: 190 }, { width: 320, height: 361 }, { width: 520, height: 520 }]) {
      localStorage.setItem('tiusdei:pip:size', JSON.stringify(size));
      expect(leerTamano(localStorage)).toEqual({ width: 320, height: 210 });
    }
    guardarTamano(localStorage, { width: 480, height: 360 });
    expect(leerTamano(localStorage)).toEqual({ width: 480, height: 360 });
  });
  it('clamps and remembers window dimensions, tolerating invalid storage', () => {
    expect(limitarTamano({ width: 1, height: 999 })).toEqual({ width: 280, height: 360 });
    expect(limitarTamano({ width: 999, height: 1 })).toEqual({ width: 480, height: 160 });
    expect(limitarTamano({ width: NaN, height: Infinity })).toEqual({ width: 320, height: 210 });
    guardarTamano(localStorage, { width: 410, height: 300 });
    expect(leerTamano(localStorage)).toEqual({ width: 410, height: 300 });
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(leerPreferencia(blocked)).toBe(true);
    expect(leerTamano(blocked)).toEqual({ width: 320, height: 210 });
    expect(() => guardarPreferencia(blocked, false)).not.toThrow();
  });
});
