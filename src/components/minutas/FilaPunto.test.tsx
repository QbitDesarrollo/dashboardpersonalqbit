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

describe('FilaPunto · actividad del MCP', () => {
  const autor = { id: 'u1', nombre: 'Even Fierro', avatar_url: null };
  const nota = (id: string, texto: string, created_at: string, extra: object = {}) => ({ id, tipo: 'nota' as const, texto, created_at, autor, via: 'mcp' as const, ...extra });

  it('no presenta la actividad del MCP como nota del cliente: muestra solo la última, discreta, con autor y hora de Ecuador', () => {
    fila({ notas: [
      nota('n1', 'Cerrado vía MCP', '2026-10-28T05:10:00Z'),
      nota('n2', 'Reabierto vía MCP: Ajustar la estimación', '2026-10-28T05:20:00Z'),
      nota('n3', 'Cerrado vía MCP', '2026-10-28T05:44:00Z'),
    ] });
    expect(screen.queryByText(/Nota del cliente/)).not.toBeInTheDocument();
    const linea = screen.getByText('Cerrado vía MCP · Even Fierro · 28 oct 00:44');
    expect(linea).toHaveAttribute('title', expect.stringContaining('Reabierto vía MCP: Ajustar la estimación'));
    expect(screen.getAllByText(/vía MCP/)).toHaveLength(1);
  });

  it('las notas reales del cliente siguen igual', () => {
    fila({ notas: [{ id: 'c1', tipo: 'nota', texto: 'Se ve bien', created_at: '2026-10-27T15:00:00Z', autor: null, autor_nombre: 'Antonio', via: 'enlace' }] });
    expect(screen.getByText('Nota del cliente:')).toBeInTheDocument();
    expect(screen.getByText('Se ve bien')).toBeInTheDocument();
  });
});
