import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Send, Loader2, Smile, ImagePlus,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, Quote, Link as LinkIcon,
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
 * Caja de comentario rica reutilizable — replica la de Tiusdei (Tiptap + emoji + imagen).
 * Parametrizable: el público sube imágenes a un endpoint sin login; el interno al autenticado.
 */
export function ClientCommentBox({
  onSubmit,
  uploadImage,
  placeholder = 'Escribe un comentario…',
  theme,
  allowInternal = false,
}: {
  onSubmit: (html: string, soloInterno?: boolean) => Promise<void>;
  uploadImage: (file: File) => Promise<{ url: string }>;
  placeholder?: string;
  theme?: 'light' | 'dark';
  allowInternal?: boolean;
}) {
  const nextTheme = useTheme();
  const isDark = (theme ?? nextTheme.resolvedTheme) === 'dark';
  const [showEmoji, setShowEmoji] = useState(false);
  const [soloInterno, setSoloInterno] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [, forceRender] = useState(0);
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
    onUpdate: () => forceRender((n) => n + 1),
    editorProps: {
      attributes: { class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2 min-h-[60px]' },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const img = items.find((i) => i.type.startsWith('image/'));
        if (!img) return false;
        const file = img.getAsFile();
        if (file) { event.preventDefault(); doUpload(file); return true; }
        return false;
      },
    },
  });

  const doUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Solo imágenes'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Máximo 8 MB'); return; }
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch { toast.error('No se pudo subir la imagen'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('URL del enlace:', prev || 'https://');
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const send = async () => {
    if (!editor) return;
    const html = editor.getHTML();
    if (editor.isEmpty) return;
    setSending(true);
    try { await onSubmit(html, soloInterno); editor.commands.clearContent(); setSoloInterno(false); }
    catch { toast.error('No se pudo enviar'); }
    finally { setSending(false); }
  };

  if (!editor) return null;

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap border-b px-1.5 py-1">
        <ToolBtn title="Título" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Subtítulo" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></ToolBtn>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ToolBtn title="Negrita" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Cursiva" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Subrayado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></ToolBtn>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ToolBtn title="Lista" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Cita" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></ToolBtn>
        <ToolBtn title="Enlace" active={editor.isActive('link')} onClick={setLink}><LinkIcon className="h-3.5 w-3.5" /></ToolBtn>
      </div>

      <EditorContent editor={editor} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); } }} />

      {/* Acciones: emoji, imagen, enviar */}
      <div className="flex items-center gap-1 border-t px-2 py-1.5 relative">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }} />
        <button type="button" title="Emoji" className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setShowEmoji((v) => !v)}>
          <Smile className="h-4 w-4" />
        </button>
        <button type="button" title="Adjuntar imagen" className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </button>
        <span className="text-[11px] text-muted-foreground ml-1 hidden sm:inline">Ctrl+Enter enviar</span>
        {allowInternal && (
          <label className={`ml-auto flex items-center gap-1.5 text-[11px] cursor-pointer select-none rounded px-1.5 py-1 ${soloInterno ? 'text-amber-700 bg-amber-50' : 'text-muted-foreground hover:bg-muted'}`} title="Si la marcas, este comentario NO lo verá el cliente">
            <input type="checkbox" checked={soloInterno} onChange={(e) => setSoloInterno(e.target.checked)} className="accent-amber-600" />
            {soloInterno ? '🔒 Nota interna' : 'Nota interna'}
          </label>
        )}
        <Button size="sm" className={allowInternal ? 'h-8' : 'ml-auto h-8'} onClick={send} disabled={sending || editor.isEmpty}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar
        </Button>

        {showEmoji && (
          <div className="absolute bottom-11 left-0 z-50">
            <EmojiPicker theme={isDark ? Theme.DARK : Theme.LIGHT} onEmojiClick={(e: EmojiClickData) => { editor.chain().focus().insertContent(e.emoji).run(); setShowEmoji(false); }} width={300} height={380} />
          </div>
        )}
      </div>
    </div>
  );
}
