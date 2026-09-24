import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { Minuta, Punto } from '@/lib/minutasApi';
import { ListaPuntos } from './ListaPuntos';

// jsdom cannot measure positions, so the drop is simulated by calling the list's onDragEnd.
let soltar: ((e: DragEndEvent) => void) | undefined;
vi.mock('@dnd-kit/core', async (orig) => {
  const real = await orig<typeof import('@dnd-kit/core')>();
  return { ...real, DndContext: (props: { onDragEnd?: (e: DragEndEvent) => void; children: React.ReactNode }) => { soltar = props.onDragEnd; return <>{props.children}</>; } };
});

const punto = (id: string, numero: number, titulo: string): Punto => ({
  id, numero, titulo, descripcion: null, responsable: null, responsable_cliente: false, fecha_compromiso: null, estado: 'pendiente',
  visible_cliente: true, resolucion: null, completado_por: null, completado_en: null, aprobado_via: null, aprobado_por_nombre: null,
  aprobado_en: null, motivo_descarte: null, evidencias: [], tareas: [], notas: [],
});
const minuta = { numero: 3, items: [punto('i1', 1, 'Uno'), punto('i2', 2, 'Dos'), punto('i3', 3, 'Tres')] } as unknown as Minuta;
const arrastrar = (desde: string, hasta: string | null) =>
  act(() => soltar?.({ active: { id: desde }, over: hasta ? { id: hasta } : null } as unknown as DragEndEvent));

describe('ListaPuntos', () => {
  const onReordenar = vi.fn();
  beforeEach(() => { onReordenar.mockReset(); render(<ListaPuntos minuta={minuta} hoy="2026-09-24" onAbrir={vi.fn()} onReordenar={onReordenar} />); });

  it('cada punto tiene una agarradera para moverlo', () => {
    expect(screen.getByRole('button', { name: 'Mover el punto 3.1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mover el punto 3.3' })).toBeInTheDocument();
  });

  it('al soltar un punto en otro lugar, pide el nuevo orden', async () => {
    await arrastrar('i3', 'i1');
    expect(onReordenar).toHaveBeenCalledWith(['i3', 'i1', 'i2']);
    await arrastrar('i1', 'i3');
    expect(onReordenar).toHaveBeenLastCalledWith(['i2', 'i3', 'i1']);
  });

  it('si lo suelta en el mismo lugar o fuera de la lista, no hace nada', async () => {
    await arrastrar('i2', 'i2');
    await arrastrar('i2', null);
    expect(onReordenar).not.toHaveBeenCalled();
  });
});
