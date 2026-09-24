import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Minuta, Punto } from '@/lib/minutasApi';
import { FilaPunto } from './FilaPunto';

const tarea = (id: string, estado: string) => ({ id, titulo_tarea: `Tarea ${id}`, estado, fecha_entrega: null, responsable: null });
const punto = (p: Partial<Punto>): Punto => ({
  id: 'i1', numero: 13, titulo: 'Ingreso declarado como capacidad de compra', descripcion: null, responsable: null, responsable_cliente: false,
  fecha_compromiso: null, estado: 'en_curso', visible_cliente: true, resolucion: null, completado_por: null, completado_en: null,
  aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null, motivo_descarte: null, evidencias: [], tareas: [], notas: [], ...p,
});
const minuta = { numero: 1 } as unknown as Minuta;
const fila = (p: Partial<Punto>, onAbrir = vi.fn()) => {
  render(<ul><FilaPunto minuta={minuta} p={punto(p)} hoy="2026-09-24" onAbrir={onAbrir} /></ul>);
  return onAbrir;
};

describe('FilaPunto · listo para cerrar', () => {
  it('cuando todas sus tareas están listas avisa y abre la vista para cerrarlo con evidencia', () => {
    const onAbrir = fila({ tareas: [tarea('t1', 'entregado'), tarea('t2', 'aprobado')] });
    fireEvent.click(screen.getByRole('button', { name: 'Listo para cerrar el punto 1.13' }));
    expect(onAbrir).toHaveBeenCalledWith('evidencia');
  });

  it('mientras falte alguna tarea no avisa', () => {
    fila({ tareas: [tarea('t1', 'entregado'), tarea('t2', 'en_proceso')] });
    expect(screen.queryByRole('button', { name: /Listo para cerrar/ })).not.toBeInTheDocument();
  });
});
