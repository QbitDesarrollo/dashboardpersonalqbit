import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { RichTextEditor } from './RichTextEditor';

const esperarEditor = () => waitFor(() => expect(document.querySelector('.ProseMirror')).not.toBeNull());

describe('RichTextEditor', () => {
  it('no avisa un cambio al abrir vacío: el detalle queda vacío y no como <p></p>', async () => {
    const onChange = vi.fn();
    render(<RichTextEditor content="" onChange={onChange} />);
    await esperarEditor();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('muestra el contenido que llega de afuera sin avisarlo como un cambio de la persona', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RichTextEditor content="" onChange={onChange} />);
    await esperarEditor();
    rerender(<RichTextEditor content="<p>Tres láminas</p>" onChange={onChange} />);
    expect(await screen.findByText('Tres láminas')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('si la persona borra todo, entrega texto vacío', async () => {
    const onChange = vi.fn();
    render(<RichTextEditor content="<p>Hola</p>" onChange={onChange} />);
    await esperarEditor();
    // The same call the editor makes when someone selects everything and deletes it.
    const editor = (document.querySelector('.ProseMirror') as unknown as { editor: { commands: { clearContent: (emit: boolean) => void } } }).editor;
    act(() => { editor.commands.clearContent(true); });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('una descripción con solo una imagen no cuenta como vacía', async () => {
    const onChange = vi.fn();
    render(<RichTextEditor content="" onChange={onChange} />);
    await esperarEditor();
    const editor = (document.querySelector('.ProseMirror') as unknown as { editor: { commands: { setContent: (html: string, o: { emitUpdate: boolean }) => void } } }).editor;
    act(() => { editor.commands.setContent('<img src="https://tiusdei.qbit.ec/uploads/editor/a.png">', { emitUpdate: true }); });
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('<img'));
  });
});
