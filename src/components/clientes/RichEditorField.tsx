import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Loader2, Smile, ImagePlus,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading2, Quote, Link as LinkIcon,
} from 'lucide-react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useTheme } from 'next-themes';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TiptapImage from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';

function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={cn('h-7 w-7 flex items-center justify-center rounded text-xs transition-colors',
        active ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
      {children}
    </button>
  );
}

/**
 * Campo de editor rico (sin botón de enviar propio) — para formularios donde
 * el botón de submit lo controla el padre (ej. "Pedir algo", "Nueva tarea").
 * Igual al editor de tareas de Tiusdei: formato + emoji + imágenes inline.
 */
export function RichEditorField({
  onChange,
  uploadImage,
  placeholder = 'Escribe aquí…',
  minHeight = '120px',
  resetKey,
  theme,
}: {
  onChange: (html: string) => void;
  uploadImage: (file: File) => Promise<{ url: string }>;
  placeholder?: string;
  minHeight?: string;
  resetKey?: number;
  theme?: 'light' | 'dark';
}) {
  const nextTheme = useTheme();
  const isDark = (theme ?? nextTheme.resolvedTheme) === 'dark';
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      // Link and Underline are added below with our own settings.
      StarterKit.configure({ link: false, underline: false }),
      UnderlineExt,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TiptapImage.configure({ inline: false, HTMLAttributes: { class: 'rounded-lg border max-w-full h-auto my-1' } }),
      TiptapLink.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } }),
      Placeholder.configure({ placeholder }),
    ],
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
    editorProps: {
      attributes: { class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2', style: `min-height:${minHeight}` },
      handlePaste: (_v, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const img = items.find((i) => i.type.startsWith('image/'));
        if (!img) return false;
        const file = img.getAsFile();
        if (file) { event.preventDefault(); doUpload(file); return true; }
        return false;
      },
      handleDrop: (_v, event, _s, moved) => {
        if (moved) return false;
        const files = Array.from((event as DragEvent).dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault(); files.forEach(doUpload); return true;
      },
    },
  });

  // Reset externo (cuando el padre limpia el form)
  useEffect(() => { if (resetKey !== undefined && editor) editor.commands.clearContent(); }, [resetKey]);

  const doUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Solo imágenes'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Máximo 8 MB'); return; }
    setUploading(true);
    try { const { url } = await uploadImage(file); editor?.chain().focus().setImage({ src: url }).run(); }
    catch { toast.error('No se pudo subir la imagen'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const setLink = () => {
    if (!editor) return;
    const url = window.prompt('URL del enlace:', editor.getAttributes('link').href || 'https://');
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  if (!editor) return null;

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <div className="flex items-center gap-0.5 flex-wrap border-b px-1.5 py-1">
        <ToolBtn title="Subtítulo" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Negrita" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Cursiva" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Subrayado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></ToolBtn>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ToolBtn title="Lista" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Cita" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Enlace" active={editor.isActive('link')} onClick={setLink}><LinkIcon className="h-3.5 w-3.5" /></ToolBtn>
        <div className="w-px h-4 bg-border mx-0.5" />
        <div className="relative">
          <ToolBtn title="Emoji" onClick={() => setShowEmoji((v) => !v)}><Smile className="h-3.5 w-3.5" /></ToolBtn>
          {showEmoji && (
            <div className="absolute top-8 left-0 z-50">
              <EmojiPicker theme={isDark ? Theme.DARK : Theme.LIGHT} onEmojiClick={(e: EmojiClickData) => { editor.chain().focus().insertContent(e.emoji).run(); setShowEmoji(false); }} width={300} height={360} />
            </div>
          )}
        </div>
        <ToolBtn title="Adjuntar imagen" onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}</ToolBtn>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }} />
      </div>
      <EditorContent editor={editor} />
      <div className="px-3 py-1 border-t text-[11px] text-muted-foreground">Puedes pegar o arrastrar imágenes de referencia 📎</div>
    </div>
  );
}
