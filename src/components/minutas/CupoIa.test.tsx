import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CupoIa } from './CupoIa';

const estado = { permitido: true, disponible: true, detalle: 'ok', usados: 2, limite: 10 };

describe('CupoIa', () => {
  it('dice cuántas minutas con IA le quedan hoy a la persona', () => {
    render(<CupoIa estado={estado} />);
    expect(screen.getByText('Te quedan 8 de 10 minutas con IA hoy')).toBeInTheDocument();
  });

  it('usa singular cuando queda una', () => {
    render(<CupoIa estado={{ ...estado, usados: 9 }} />);
    expect(screen.getByText('Te queda 1 de 10 minutas con IA hoy')).toBeInTheDocument();
  });

  it('avisa cuando ya se usaron todas', () => {
    render(<CupoIa estado={{ ...estado, usados: 10 }} />);
    expect(screen.getByText('Ya usaste tus 10 minutas con IA de hoy')).toBeInTheDocument();
  });

  it('no muestra nada a quien no tiene acceso', () => {
    const { container } = render(<CupoIa estado={{ ...estado, permitido: false }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
