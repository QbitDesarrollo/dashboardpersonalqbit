import { describe, it, expect, vi } from 'vitest';
import { generarMinutaPdf, nombreArchivoPdf, puntosPdf, exportarMinutaPdf, type Imagen } from './minutaPdf';
import type { Minuta, Punto } from './minutasApi';

const punto = (p: Partial<Punto>): Punto => ({
  id: 'i', numero: 1, titulo: 'Filtro', descripcion: null, responsable: null, responsable_cliente: false, fecha_compromiso: null,
  estado: 'pendiente', visible_cliente: true, resolucion: null, completado_por: null, completado_en: null, aprobado_via: null,
  aprobado_por_nombre: null, aprobado_en: null, motivo_descarte: null, evidencias: [], tareas: [], notas: [], ...p,
});

const CAPTURA = 'https://tiusdei.qbit.ec/uploads/editor/5c6a8ba8-09c8-485f-9373-5172b5edab32.png';
const minuta = {
  id: 'm3', brand_nombre: 'Dinatek', numero: 3, codigo: 'M-03', titulo: 'Revisión de avance: home/catálogo', fecha: '2026-09-22',
  project_nombre: 'Sitio web', owner: { id: 'u1', nombre: 'Even Fierro' }, miembros: [{ id: 'u2', nombre: 'Diego Ruiz' }],
  resumen: 'Se priorizó el catálogo.', estado: 'publicada',
  items: [
    punto({ id: 'a', numero: 1, titulo: 'Filtro por marca', descripcion: 'En celular', responsable: { id: 'u2', nombre: 'Diego Ruiz' }, estado: 'en_curso', fecha_compromiso: '2026-10-06' }),
    punto({ id: 'b', numero: 2, titulo: 'Video en el home', estado: 'completado', resolucion: 'Video de 12 s.', evidencias: [
      { id: 'e1', tipo: 'imagen', nombre: 'captura.png', url: CAPTURA, drive_file_id: null, origen_task_id: null },
      { id: 'e2', tipo: 'enlace', nombre: 'Home en staging', url: 'https://www.staging.dinatek.ec/home', drive_file_id: null, origen_task_id: null },
    ], notas: [{ id: 'n', tipo: 'ajuste', texto: 'Más corto', created_at: '2026-09-23T15:00:00Z', autor: null, autor_nombre: 'Antonio', via: 'enlace' }] }),
    punto({ id: 'c', numero: 3, titulo: 'Fichas técnicas', responsable_cliente: true }),
    punto({ id: 'd', numero: 4, titulo: 'Costo de licencia', visible_cliente: false }),
    punto({ id: 'e', numero: 5, titulo: 'Idea descartada', estado: 'descartado' }),
  ],
} as unknown as Minuta;

// 1x1 transparent PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const imagen: Imagen = { dataUrl: PNG, ancho: 800, alto: 450, formato: 'PNG' };

describe('puntosPdf', () => {
  it('excluye actividad MCP del PDF del cliente, no del interno', async () => {
    const m = { ...minuta, items: [punto({ notas: [
      { id: 'mcp', tipo: 'nota' as const, texto: 'Cerrado vía MCP', via: 'mcp' as const, created_at: '2026-09-24T15:00:00Z', autor: null },
      { id: 'cliente', tipo: 'nota' as const, texto: 'Comentario compartido', via: 'enlace' as const, created_at: '2026-09-24T15:00:00Z', autor: null },
    ] })] };
    expect(puntosPdf(m, { soloVisibles: true })[0].notas.map((n) => n.texto)).toEqual(['Comentario compartido']);
    expect(puntosPdf(m)[0].notas).toHaveLength(2);
    const pdf = new TextDecoder('latin1').decode(await generarMinutaPdf(m, { soloVisibles: true }, { cargarImagen: async () => null }));
    expect(pdf).not.toContain('MCP');
    expect(pdf).toContain('Comentario compartido');
  });
  it('un bloque por punto con lo que el lector necesita: responsable, estado, compromiso si sigue abierto, lo hecho y la evidencia', () => {
    const [abierto, hecho, cliente] = puntosPdf(minuta);
    expect(abierto).toMatchObject({
      codigo: '3.1', titulo: 'Filtro por marca', descripcion: 'En celular', responsable: 'Diego Ruiz',
      estado: { texto: 'En curso', tono: 'blue' }, compromiso: '6 oct', queSeHizo: null, imagenes: [], enlaces: [],
    });
    expect(hecho).toMatchObject({
      codigo: '3.2', compromiso: null, queSeHizo: { titulo: 'Qué se hizo', texto: 'Video de 12 s.' },
      imagenes: [{ nombre: 'captura.png', url: CAPTURA }],
      enlaces: [{ nombre: 'Home en staging', origen: 'staging.dinatek.ec', url: 'https://www.staging.dinatek.ec/home' }],
      notas: [{ texto: 'Más corto', etiqueta: 'Ajuste pedido por Antonio' }],
    });
    expect(cliente).toMatchObject({ responsable: 'Cliente', estado: { texto: 'Esperando al cliente' } });
  });

  it('la versión para el cliente deja fuera lo interno y lo descartado', () => {
    expect(puntosPdf(minuta, { soloVisibles: true }).map((p) => p.codigo)).toEqual(['3.1', '3.2', '3.3']);
    expect(puntosPdf(minuta).map((p) => [p.codigo, p.interno])).toEqual([['3.1', false], ['3.2', false], ['3.3', false], ['3.4', true], ['3.5', false]]);
  });
});

describe('generarMinutaPdf', () => {
  const texto = async (buffer: ArrayBuffer) => new TextDecoder('latin1').decode(buffer);

  it('encabezado como los reportes, avance, resumen, un bloque por punto, las capturas como imagen y los enlaces sin la URL de la captura', async () => {
    const cargarImagen = vi.fn(async () => imagen);
    const pdf = await texto(await generarMinutaPdf(minuta, { soloVisibles: true }, { cargarImagen }));
    expect(pdf.startsWith('%PDF-')).toBe(true);
    for (const esperado of [
      'Revisi', 'Dinatek', 'M-03', '22 sep 2026', 'Responsable: Even Fierro', 'Resumen y acuerdos', 'Se prioriz',
      'Puntos', '1 de 3 puntos cerrados', 'En curso: 1', 'Esperando al cliente: 1', 'Filtro por marca', 'Compromiso: 6 oct', 'Video en el home', 'SE HIZO', 'Video de 12 s.',
      'Home en staging', 'staging.dinatek.ec', 'Ajuste pedido por Antonio', 'Fichas t', 'Esperando al cliente', 'gina 1 de',
    ]) expect(pdf, esperado).toContain(esperado);
    expect(pdf).not.toContain('uploads/editor');
    expect(pdf).not.toContain('Costo de licencia');
    expect(pdf).toContain('/Subtype /Image');
    expect(cargarImagen).toHaveBeenCalledWith(CAPTURA);
  });

  it('si una captura no carga, lo dice en su lugar y el PDF sale igual', async () => {
    const pdf = await texto(await generarMinutaPdf(minuta, { soloVisibles: true }, { cargarImagen: async () => null }));
    expect(pdf).toContain('Captura no disponible: captura.png');
  });

  it('la versión completa marca los puntos internos', async () => {
    const pdf = await texto(await generarMinutaPdf(minuta, {}, { cargarImagen: async () => imagen }));
    expect(pdf).toContain('Costo de licencia');
    expect(pdf).toContain('Solo interno');
  });
});

describe('nombreArchivoPdf', () => {
  it('usa marca, código y fecha, sin caracteres raros', () => {
    expect(nombreArchivoPdf(minuta)).toBe('Minuta Dinatek M-03 2026-09-22.pdf');
  });
});

describe('exportarMinutaPdf', () => {
  it('genera y guarda el PDF con ese nombre', async () => {
    const guardar = vi.fn();
    await exportarMinutaPdf(minuta, { soloVisibles: true }, { cargarImagen: async () => imagen, guardar });
    expect(guardar).toHaveBeenCalledWith(expect.any(Blob), 'Minuta Dinatek M-03 2026-09-22.pdf');
  });
});
