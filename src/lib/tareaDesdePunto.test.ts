import { describe, it, expect } from 'vitest';
import { urlNuevaTareaDesdePunto, leerPrefillNuevaTarea } from './tareaDesdePunto';

describe('tarea desde un punto de minuta', () => {
  const datos = {
    brandId: 'b1', projectId: 'p1', titulo: 'Diseñar el botón de WhatsApp',
    detalle: 'Botón fijo abajo.\n\nOrigen: Dinatek M-03, punto 3.4.', fechaEntrega: '2026-10-03',
    minutaItemId: 'i4', minutaId: 'm3',
  };

  it('arma la URL y Tareas la lee de vuelta con el formulario prellenado', () => {
    const url = urlNuevaTareaDesdePunto(datos);
    expect(url.startsWith('/tareas?')).toBe(true);
    const prefill = leerPrefillNuevaTarea(new URLSearchParams(url.split('?')[1]));
    expect(prefill).toEqual({
      form: {
        titulo_tarea: 'Diseñar el botón de WhatsApp',
        detalle: 'Botón fijo abajo.\n\nOrigen: Dinatek M-03, punto 3.4.',
        brand_id: 'b1', project_id: 'p1', fecha_entrega: '2026-10-03', desk_id: '',
      },
      minutaItemId: 'i4',
      volver: '/minutas/m3',
    });
  });

  it('sin nueva=1 no hace nada', () => {
    expect(leerPrefillNuevaTarea(new URLSearchParams('task=t1'))).toBeNull();
  });

  it('ignora un "volver" que no sea una minuta, para no redirigir a otro sitio', () => {
    const qs = new URLSearchParams('nueva=1&brand_id=b1&titulo=X&minuta_item=i4&volver=https://evil.example');
    expect(leerPrefillNuevaTarea(qs)?.volver).toBeNull();
  });
});
