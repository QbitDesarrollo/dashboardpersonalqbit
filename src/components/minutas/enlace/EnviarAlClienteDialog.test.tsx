import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import * as api from '@/lib/minutaEnlaceApi';
import { EnviarAlClienteDialog } from './EnviarAlClienteDialog';

vi.mock('@/lib/minutaEnlaceApi', () => ({ contactosMinuta: vi.fn(), prepararResumen: vi.fn(), enviarCliente: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const m = vi.mocked(api);
const portapapeles = vi.fn(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: portapapeles } });
  m.contactosMinuta.mockResolvedValue([
    { id: 'c1', nombre: 'Antonio Pérez', email: 'antonio@alba.ec' },
    { id: 'c2', nombre: 'María León', email: 'maria@alba.ec' },
  ]);
  m.prepararResumen.mockResolvedValue('Se revisó el panel y queda un ajuste.');
  m.enviarCliente.mockImplementation(async (_id, d) => ({ mensaje: `Mensaje ${d.medio} para ${d.para.map((p) => p.nombre).join(', ') || 'nadie'}: ${d.resumen}` }));
});

const abrir = (onEnviado = vi.fn(), onOpenChange = vi.fn()) => {
  render(<EnviarAlClienteDialog minutaId="m1" abierto onOpenChange={onOpenChange} onEnviado={onEnviado} />);
  return { onEnviado, onOpenChange };
};

describe('EnviarAlClienteDialog', () => {
  it('elige contactos, agrega uno nuevo, prepara el resumen con la IA, lo edita y lo manda por correo', async () => {
    const { onEnviado, onOpenChange } = abrir();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Antonio Pérez (antonio@alba.ec)' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Luis Mora' } });
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'luis@alba.ec' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByRole('checkbox', { name: 'Luis Mora (luis@alba.ec)' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Preparar resumen' }));
    const resumen = await screen.findByDisplayValue('Se revisó el panel y queda un ajuste.');
    fireEvent.change(resumen, { target: { value: 'Queda un ajuste del color.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar por correo' }));
    await waitFor(() => expect(m.enviarCliente).toHaveBeenLastCalledWith('m1', {
      medio: 'correo', resumen: 'Queda un ajuste del color.',
      para: [{ nombre: 'Antonio Pérez', email: 'antonio@alba.ec' }, { nombre: 'Luis Mora', email: 'luis@alba.ec' }],
    }));
    expect(toast.success).toHaveBeenCalledWith('Minuta enviada a 2 personas');
    expect(onEnviado).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('muestra la vista previa del mensaje tal como sale', async () => {
    abrir();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'María León (maria@alba.ec)' }));
    expect(await screen.findByText('Mensaje vista_previa para María León:')).toBeInTheDocument();
  });

  it('copiar el mensaje no manda correo: lo deja en el portapapeles y en el historial', async () => {
    const { onEnviado } = abrir();
    await screen.findByRole('checkbox', { name: 'Antonio Pérez (antonio@alba.ec)' });
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensaje' }));
    await waitFor(() => expect(m.enviarCliente).toHaveBeenLastCalledWith('m1', { medio: 'copiado', para: [], resumen: '' }));
    expect(portapapeles).toHaveBeenCalledWith('Mensaje copiado para nadie: ');
    expect(toast.success).toHaveBeenCalledWith('Mensaje copiado. Pégalo donde quieras.');
    expect(onEnviado).toHaveBeenCalled();
  });

  it('lo escrito en nombre y correo cuenta sin presionar "Agregar": sale en la vista previa y en el envío', async () => {
    abrir();
    await screen.findByRole('checkbox', { name: 'Antonio Pérez (antonio@alba.ec)' });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Luis Mora' } });
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'luis@alba.ec' } });
    expect(await screen.findByText('Mensaje vista_previa para Luis Mora:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar por correo' }));
    await waitFor(() => expect(m.enviarCliente).toHaveBeenLastCalledWith('m1', { medio: 'correo', resumen: '', para: [{ nombre: 'Luis Mora', email: 'luis@alba.ec' }] }));
  });

  it('para copiar basta el nombre; sin correo no se puede mandar por correo y lo explica', async () => {
    abrir();
    await screen.findByRole('checkbox', { name: 'Antonio Pérez (antonio@alba.ec)' });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Luis Mora' } });
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Enviar por correo' })).toBeDisabled();
    expect(screen.getByText('Luis Mora no tiene correo: puedes copiar el mensaje o agregarle uno para enviarlo por correo.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByRole('checkbox', { name: 'Luis Mora (sin correo)' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensaje' }));
    await waitFor(() => expect(m.enviarCliente).toHaveBeenLastCalledWith('m1', { medio: 'copiado', resumen: '', para: [{ nombre: 'Luis Mora' }] }));
  });

  it('sin destinatarios no se puede mandar por correo', async () => {
    abrir();
    await screen.findByRole('checkbox', { name: 'Antonio Pérez (antonio@alba.ec)' });
    expect(screen.getByRole('button', { name: 'Enviar por correo' })).toBeDisabled();
  });

  it('no agrega un correo inválido', async () => {
    abrir();
    await screen.findByRole('checkbox', { name: 'Antonio Pérez (antonio@alba.ec)' });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Luis' } });
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'luis' } });
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeDisabled();
  });

  it('si la IA no puede, lo dice y el resumen se escribe a mano', async () => {
    m.prepararResumen.mockRejectedValue(new Error('Codex está ocupado con otro trabajo. Escribe el resumen tú o intenta en un momento.'));
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Preparar resumen' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Codex está ocupado con otro trabajo. Escribe el resumen tú o intenta en un momento.'));
    fireEvent.change(screen.getByLabelText('Resumen para el cliente'), { target: { value: 'Escrito a mano' } });
    expect(screen.getByDisplayValue('Escrito a mano')).toBeInTheDocument();
  });
});
