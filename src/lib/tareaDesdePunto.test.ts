import { describe, it, expect } from 'vitest';
import { prellenadoDesdePunto } from './tareaDesdePunto';

const minuta = { brand_id: 'b1', brand_nombre: 'Dinatek', project_id: 'p1', codigo: 'M-03', numero: 3 };
const punto = { numero: 2, titulo: 'Video en el home', descripcion: 'Botón fijo abajo.', fecha_compromiso: '2026-10-03' };

describe('prellenadoDesdePunto', () => {
  it('prellena la tarea con la marca, el proyecto, el título, la fecha y el origen del punto', () => {
    expect(prellenadoDesdePunto(minuta, punto)).toEqual({
      brand_id: 'b1', project_id: 'p1', desk_id: '', titulo_tarea: 'Video en el home', fecha_entrega: '2026-10-03',
      detalle: '<p>Botón fijo abajo.</p><p>Origen: Dinatek M-03, punto 3.2.</p>',
    });
  });

  it('sin proyecto, fecha ni descripción deja esos campos vacíos', () => {
    expect(prellenadoDesdePunto({ ...minuta, project_id: null }, { ...punto, descripcion: null, fecha_compromiso: null })).toMatchObject({
      project_id: '', fecha_entrega: '', detalle: '<p>Origen: Dinatek M-03, punto 3.2.</p>',
    });
  });

  it('escapa el texto del punto y conserva sus saltos de línea', () => {
    const { detalle } = prellenadoDesdePunto(minuta, { ...punto, descripcion: 'Usar <b> & "comillas"\nSegunda línea' });
    expect(detalle).toBe('<p>Usar &lt;b&gt; &amp; "comillas"<br>Segunda línea</p><p>Origen: Dinatek M-03, punto 3.2.</p>');
  });
});
