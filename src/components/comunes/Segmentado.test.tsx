import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { Segmentado } from './Segmentado';

function Ejemplo() {
  const [valor, cambiar] = useState('Semana');
  return <Segmentado etiqueta="Vista" valor={valor} onCambiar={cambiar} opciones={['Semana', 'Mes'].map(v => ({ valor: v, etiqueta: v }))} />;
}
describe('Segmentado', () => {
  it('muestra una selección primaria y mueve selección y foco con flechas, Home y End', () => {
    render(<Ejemplo />);
    const semana = screen.getByRole('tab', { name: 'Semana' });
    const mes = screen.getByRole('tab', { name: 'Mes' });
    expect(semana).toHaveAttribute('aria-selected', 'true');
    expect(semana).toHaveClass('bg-primary');
    expect(mes).toHaveAttribute('tabindex', '-1');
    semana.focus(); fireEvent.keyDown(semana, { key: 'ArrowRight' });
    expect(mes).toHaveFocus(); expect(mes).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(mes, { key: 'ArrowRight' }); expect(semana).toHaveFocus();
    fireEvent.keyDown(semana, { key: 'End' }); expect(mes).toHaveFocus();
    fireEvent.keyDown(mes, { key: 'Home' }); expect(semana).toHaveFocus();
    fireEvent.keyDown(semana, { key: 'ArrowLeft' }); expect(mes).toHaveFocus();
    fireEvent.click(semana); expect(semana).toHaveAttribute('aria-selected', 'true');
  });
});
