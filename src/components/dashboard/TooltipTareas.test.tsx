import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipTareas } from './TooltipTareas';
import type { Task } from '@/lib/dashboardDatos';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('tooltip de tareas', () => {
  it('sale del contexto de apilamiento de las tarjetas y limita la vista previa', () => {
    const tareas = Array.from({length:5},(_,i)=>({id:String(i),titulo_tarea:`Título ${i}`} as Task));
    const {container} = render(<TooltipTareas titulo="Responsable" grupos={[{nombre:'Completadas',tareas}]} />);
    const tooltip = screen.getByRole('tooltip');
    expect(container).not.toContainElement(tooltip); expect(document.body).toContainElement(tooltip);
    expect(tooltip).toHaveTextContent('Completadas: 5'); expect(tooltip).toHaveTextContent('Y 2 más.');
    expect(tooltip).not.toHaveTextContent('Título 3');
  });
  it('permanece dentro de la pantalla aunque el ancla esté en la esquina', () => {
    vi.stubGlobal('innerWidth',1024); vi.stubGlobal('innerHeight',768);
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
      const ancla = this.tagName === 'SPAN';
      return {x:ancla?1000:0,y:ancla?740:0,left:ancla?1000:0,top:ancla?740:0,
        width:ancla?0:320,height:ancla?0:180,right:ancla?1000:320,bottom:ancla?740:180,toJSON:()=>({})};
    });
    render(<TooltipTareas titulo="Responsable" grupos={[]} />);
    const estilo = screen.getByRole('tooltip').style;
    expect(Number.parseFloat(estilo.left)+320).toBeLessThanOrEqual(1016);
    expect(Number.parseFloat(estilo.top)+180).toBeLessThanOrEqual(760);
  });
});
