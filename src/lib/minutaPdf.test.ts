import { describe, it, expect, vi } from 'vitest';
import { filasPdf, nombreArchivoPdf, exportarMinutaPdf } from './minutaPdf';
import type { Minuta, Punto } from './minutasApi';

const save = vi.fn();
vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    setFontSize: vi.fn(), setFont: vi.fn(), setTextColor: vi.fn(), text: vi.fn(), splitTextToSize: vi.fn((t: string) => [t]),
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } }, lastAutoTable: { finalY: 100 }, save,
  })),
}));
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));

const punto = (p: Partial<Punto>): Punto => ({
  id: 'i', numero: 1, titulo: 'Filtro', descripcion: null, responsable: null, responsable_cliente: false, fecha_compromiso: null,
  estado: 'pendiente', visible_cliente: true, resolucion: null, completado_por: null, completado_en: null, aprobado_via: null,
  aprobado_por_nombre: null, aprobado_en: null, motivo_descarte: null, evidencias: [], tareas: [], notas: [], ...p,
});

const minuta = {
  id: 'm3', brand_nombre: 'Dinatek', numero: 3, codigo: 'M-03', titulo: 'Revisión de avance: home/catálogo', fecha: '2026-09-22',
  project_nombre: null, owner: { id: 'u1', nombre: 'Even' }, miembros: [], resumen: null, estado: 'publicada',
  items: [
    punto({ numero: 1, titulo: 'Filtro por marca', descripcion: 'En celular', responsable: { id: 'u2', nombre: 'Diego Ruiz' }, estado: 'en_curso', fecha_compromiso: '2026-10-06' }),
    punto({ numero: 2, titulo: 'Video en el home', estado: 'completado', resolucion: 'Video de 12 s.', evidencias: [{ id: 'e', tipo: 'enlace', nombre: 'Home en staging', url: 'https://x.com/home', drive_file_id: null, origen_task_id: null }] }),
    punto({ numero: 3, titulo: 'Fichas técnicas', responsable_cliente: true }),
    punto({ numero: 4, titulo: 'Costo de licencia', visible_cliente: false }),
  ],
} as unknown as Minuta;

describe('filasPdf', () => {
  it('arma una fila por punto con responsable, estado y lo hecho o la fecha', () => {
    expect(filasPdf(minuta)).toEqual([
      ['3.1', 'Filtro por marca\nEn celular', 'Diego Ruiz', 'En curso', 'Compromiso: 6 oct'],
      ['3.2', 'Video en el home', '—', 'Completado', 'Video de 12 s.\nHome en staging: https://x.com/home'],
      ['3.3', 'Fichas técnicas', 'Cliente', 'Esperando al cliente', ''],
      ['3.4', 'Costo de licencia (interno)', '—', 'Pendiente', ''],
    ]);
  });

  it('puede dejar fuera los puntos internos, para mandarle el PDF al cliente', () => {
    expect(filasPdf(minuta, { soloVisibles: true }).map((f) => f[0])).toEqual(['3.1', '3.2', '3.3']);
  });
});

describe('nombreArchivoPdf', () => {
  it('usa marca, código y fecha, sin caracteres raros', () => {
    expect(nombreArchivoPdf(minuta)).toBe('Minuta Dinatek M-03 2026-09-22.pdf');
  });
});

describe('exportarMinutaPdf', () => {
  it('guarda el PDF con ese nombre', () => {
    exportarMinutaPdf(minuta);
    expect(save).toHaveBeenCalledWith('Minuta Dinatek M-03 2026-09-22.pdf');
  });
});
