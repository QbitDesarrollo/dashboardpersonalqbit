import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TimerWarningDialog } from './TimerWarningDialog';

const TITULO = 'Proyecta Connect | Pantalla Equipo: gestionar asesores y quitar acceso sin mover números';

describe('TimerWarningDialog', () => {
  it('muestra la tarea en varias líneas si hace falta, con el nombre completo al pasar el mouse', () => {
    render(<TimerWarningDialog />);
    act(() => { window.dispatchEvent(new CustomEvent('timer:warning', { detail: { horas: 2, titulo: TITULO, onPause() {} } })); });
    const tarea = screen.getByText(`Tarea: ${TITULO}`);
    expect(tarea).toHaveAttribute('title', TITULO);
    // A single forced line inside the dialog's grid widens it past its border.
    expect(tarea).not.toHaveClass('truncate');
  });
});
