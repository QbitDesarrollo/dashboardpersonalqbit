import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorPuntos, type PuntoBorrador } from './EditorPuntos';

const personas = [{ id: 'u1', nombre: 'Diego Ruiz' }];

function Harness({ inicial = [] as PuntoBorrador[] }) {
  const [puntos, setPuntos] = useState<PuntoBorrador[]>(inicial);
  return (
    <>
      <EditorPuntos puntos={puntos} onChange={setPuntos} personas={personas} />
      <output data-testid="estado">{JSON.stringify(puntos.map((p) => [p.titulo, p.descripcion, p.responsable]))}</output>
    </>
  );
}

const estado = () => JSON.parse(screen.getByTestId('estado').textContent || '[]');

describe('EditorPuntos', () => {
  it('Enter en la captura rápida agrega el punto y limpia el campo', () => {
    render(<Harness />);
    const captura = screen.getByPlaceholderText('Escribe un punto y presiona Enter');
    fireEvent.change(captura, { target: { value: 'Filtro por marca en el catálogo' } });
    fireEvent.keyDown(captura, { key: 'Enter' });
    expect(estado()).toEqual([['Filtro por marca en el catálogo', '', '']]);
    expect(captura).toHaveValue('');
  });

  it('cada punto se puede editar: título y descripción', () => {
    render(<Harness inicial={[{ clave: 'a', titulo: 'Filtro', descripcion: '', responsable: '', fecha: '' }]} />);
    fireEvent.change(screen.getByLabelText('Título del punto 1'), { target: { value: 'Filtro por marca' } });
    fireEvent.change(screen.getByLabelText('Descripción del punto 1'), { target: { value: 'Sobre todo en celular.' } });
    expect(estado()).toEqual([['Filtro por marca', 'Sobre todo en celular.', '']]);
  });

  it('asigna el punto a alguien del equipo o al cliente', () => {
    render(<Harness inicial={[
      { clave: 'a', titulo: 'Filtro', descripcion: '', responsable: '', fecha: '' },
      { clave: 'b', titulo: 'Fichas técnicas', descripcion: '', responsable: '', fecha: '' },
    ]} />);
    fireEvent.change(screen.getByLabelText('Responsable del punto 1'), { target: { value: 'u1' } });
    fireEvent.change(screen.getByLabelText('Responsable del punto 2'), { target: { value: 'cliente' } });
    expect(estado().map((p: string[]) => p[2])).toEqual(['u1', 'cliente']);
  });

  it('quita un punto', () => {
    render(<Harness inicial={[
      { clave: 'a', titulo: 'Filtro', descripcion: '', responsable: '', fecha: '' },
      { clave: 'b', titulo: 'Botón de WhatsApp', descripcion: '', responsable: '', fecha: '' },
    ]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el punto 1' }));
    expect(estado().map((p: string[]) => p[0])).toEqual(['Botón de WhatsApp']);
  });
  it('muestra la cita de la reunión que respalda un punto propuesto por la IA', () => {
    render(<Harness inicial={[
      { clave: 'a', titulo: 'Video en el home', descripcion: '', responsable: '', fecha: '', cita: 'que el video no suene' },
      { clave: 'b', titulo: 'Filtro', descripcion: '', responsable: '', fecha: '' },
    ]} />);
    expect(screen.getByText('«que el video no suene»')).toBeInTheDocument();
    expect(screen.getAllByText(/^Dicho en la reunión:/)).toHaveLength(1);
  });

  it('si el punto salió de lo que mandó el cliente, la cita lo dice', () => {
    render(<Harness inicial={[
      { clave: 'a', titulo: 'Agregar incidencias', descripcion: '', responsable: '', fecha: '', cita: 'Agregar incidencias', citaFuente: 'cliente' },
    ]} />);
    expect(screen.getByText(/^Según lo que mandó el cliente:/)).toBeInTheDocument();
    expect(screen.queryByText(/^Dicho en la reunión:/)).not.toBeInTheDocument();
  });
});
