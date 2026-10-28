import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { Punto } from '@/lib/minutasApi';
import { PuntoPresentado } from './PuntoPresentado';

const punto = (p: Partial<Punto>): Punto => ({
  id: 'i1', numero: 1, titulo: 'Video en el home', descripcion: null, responsable: null, responsable_cliente: false,
  fecha_compromiso: null, estado: 'en_curso', visible_cliente: true, resolucion: null, completado_por: null, completado_en: null,
  aprobado_via: null, aprobado_por_nombre: null, aprobado_en: null, motivo_descarte: null, evidencias: [], tareas: [], notas: [], ...p,
});

describe('PuntoPresentado', () => {
  it('no presenta actividad interna del MCP al cliente', () => {
    render(<PuntoPresentado codigo="3.1" punto={punto({ notas: [
      { id: 'mcp', tipo: 'nota', texto: 'Reabierto vía MCP: corregir color', via: 'mcp', created_at: '2026-09-24T15:00:00Z', autor: null },
      { id: 'cliente', tipo: 'nota', texto: 'Comentario visible', via: 'enlace', created_at: '2026-09-24T15:00:00Z', autor: null },
    ] })} />);
    expect(screen.queryByText(/vía MCP/)).not.toBeInTheDocument();
    expect(screen.getByText('Comentario visible')).toBeInTheDocument();
  });
  it('muestra el código, el estado para el cliente y la fecha de compromiso', () => {
    render(<PuntoPresentado punto={punto({ fecha_compromiso: '2026-10-03' })} codigo="3.1" />);
    expect(screen.getByText('3.1')).toBeInTheDocument();
    expect(screen.getByText('En marcha')).toBeInTheDocument();
    expect(screen.getByText(/Compromiso: 3 oct/)).toBeInTheDocument();
  });

  it('muestra cada enlace como tarjeta con su origen', () => {
    render(<PuntoPresentado codigo="3.1" punto={punto({
      estado: 'completado', resolucion: 'Listo en staging.',
      evidencias: [
        { id: 'e1', tipo: 'drive', nombre: 'Guion final.docx', url: 'https://drive.google.com/file/d/x/view', drive_file_id: 'x', origen_task_id: null },
        { id: 'e2', tipo: 'enlace', nombre: 'Home en staging', url: 'https://www.staging.dinatek.com/home', drive_file_id: null, origen_task_id: null },
      ],
    })} />);
    expect(screen.getByRole('link', { name: /Guion final.docx/ })).toHaveTextContent('Google Drive');
    expect(screen.getByRole('link', { name: /Home en staging/ })).toHaveTextContent(/Home en staging\s*staging\.dinatek\.com$/);
  });

  it('sin avances lo dice, según a quién le toque', () => {
    const { unmount } = render(<PuntoPresentado punto={punto({})} codigo="3.1" />);
    expect(screen.getByText('Todavía no hay avances para mostrar en este punto.')).toBeInTheDocument();
    unmount();
    render(<PuntoPresentado punto={punto({ responsable_cliente: true, estado: 'pendiente' })} codigo="3.2" />);
    expect(screen.getByText('Cuando nos lo envíes, lo marcamos como recibido.')).toBeInTheDocument();
  });

  it('distingue las notas de los ajustes pedidos', () => {
    render(<PuntoPresentado codigo="3.1" punto={punto({ notas: [
      { id: 'n1', tipo: 'nota', texto: 'Le gusta.', created_at: '2026-09-24T15:00:00.000Z', autor: null },
      { id: 'n2', tipo: 'ajuste', texto: 'Sin sonido.', created_at: '2026-09-24T15:05:00.000Z', autor: null },
    ] })} />);
    const [nota, ajuste] = within(screen.getByRole('article')).getAllByRole('listitem');
    expect(nota).toHaveTextContent(/^Nota · .*Le gusta\.$/);
    expect(ajuste).toHaveTextContent(/^Ajuste pedido · .*Sin sonido\.$/);
  });
});
