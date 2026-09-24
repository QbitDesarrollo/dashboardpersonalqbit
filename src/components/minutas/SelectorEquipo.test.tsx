import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import { SelectorEquipo } from './SelectorEquipo';

const PERSONAS = [
  { id: 'u1', nombre: 'Even Fierro' },
  { id: 'u2', nombre: 'Andrés Gonzales' },
  { id: 'u3', nombre: 'Andres Molina' },
  { id: 'u4', nombre: 'Diego Ruiz' },
];

function Probar({ inicial = [] as string[], excluir, onChange = vi.fn() }: { inicial?: string[]; excluir?: string; onChange?: (ids: string[]) => void }) {
  const [ids, setIds] = useState(inicial);
  return <SelectorEquipo personas={PERSONAS} seleccionados={ids} excluir={excluir} onChange={(n) => { setIds(n); onChange(n); }} />;
}

describe('SelectorEquipo', () => {
  it('muestra arriba a los elegidos y permite quitarlos', () => {
    const onChange = vi.fn();
    render(<Probar inicial={['u4']} onChange={onChange} />);
    const elegidos = screen.getByRole('list', { name: 'Equipo elegido' });
    expect(within(elegidos).getByText('Diego Ruiz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Diego Ruiz' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByText('Nadie elegido todavía.')).toBeInTheDocument();
  });

  it('busca por nombre sin importar tildes ni mayúsculas', () => {
    render(<Probar />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar persona' }), { target: { value: 'ANDRES' } });
    expect(screen.getByRole('checkbox', { name: 'Andrés Gonzales' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Andres Molina' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Diego Ruiz' })).not.toBeInTheDocument();
  });

  it('marcar en la lista agrega a la persona y desmarcar la quita', () => {
    const onChange = vi.fn();
    render(<Probar onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Andres Molina' }));
    expect(onChange).toHaveBeenLastCalledWith(['u3']);
    expect(screen.getByRole('checkbox', { name: 'Andres Molina' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Andres Molina' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('no ofrece al responsable de la minuta', () => {
    render(<Probar excluir="u1" />);
    expect(screen.queryByRole('checkbox', { name: 'Even Fierro' })).not.toBeInTheDocument();
  });

  it('avisa cuando la búsqueda no encuentra a nadie', () => {
    render(<Probar />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar persona' }), { target: { value: 'zzz' } });
    expect(screen.getByText('Nadie coincide con “zzz”.')).toBeInTheDocument();
  });
});
