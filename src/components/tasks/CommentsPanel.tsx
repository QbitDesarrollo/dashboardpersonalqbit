import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/lib/apiClient';
import { useCommentsSocket, type Comment } from '@/hooks/useCommentsSocket';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import {
  MessageSquare, Send, Loader2, AtSign, Smile, ImagePlus, X, Heart, Trash2,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading1, Heading2, AlignLeft, AlignCenter, AlignRight, Indent,
  Quote, Link as LinkIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, getInitials } from '@/lib/utils';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';

// Tiptap
import { useEditor, EditorContent, Editor, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TiptapImage from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

interface CommentsPanelProps {
  taskId: string;
  /** Si se pasa, solo se mostrarán miembros de esa mesa en el autocomplete de @ */
  deskId?: string;
}

interface Profile {
  id: string;
  nombre: string;
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolBtn({
  active, onClick, title, children,
}: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'h-7 w-7 flex items-center justify-center rounded text-xs transition-colors',
        active
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

// ── Rich text toolbar ─────────────────────────────────────────────────────────
function RichToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL del enlace', prev ?? 'https://');
    if (url === null) return;
    if (!url) { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1 bg-muted/30 rounded-t-md">
      {/* Headings */}
      <ToolBtn
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Título 1"
      >
        <Heading1 className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Título 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolBtn>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Inline */}
      <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita">
        <Bold className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva">
        <Italic className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado">
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolBtn>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Lists */}
      <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">
        <List className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Cita">
        <Quote className="h-3.5 w-3.5" />
      </ToolBtn>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Indent */}
      <ToolBtn onClick={() => editor.chain().focus().sinkListItem('listItem').run()} title="Aumentar sangría">
        <Indent className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().liftListItem('listItem').run()} title="Reducir sangría">
        <Indent className="h-3.5 w-3.5 rotate-180" />
      </ToolBtn>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Alignment */}
      <ToolBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Alinear izquierda">
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centrar">
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Alinear derecha">
        <AlignRight className="h-3.5 w-3.5" />
      </ToolBtn>

      <div className="w-px h-4 bg-border mx-0.5" />

      {/* Link */}
      <ToolBtn active={editor.isActive('link')} onClick={setLink} title="Insertar enlace">
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolBtn>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function CommentsPanel({ taskId, deskId }: CommentsPanelProps) {
  const { resolvedTheme } = useTheme();
  const { user, isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Emoji picker
  const [showEmoji, setShowEmoji] = useState(false);

  // Imagen pegada / seleccionada
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Menciones — el dropdown se monta FUERA del editor (relativo al form wrapper)
  const [users, setUsers] = useState<Profile[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const formWrapperRef = useRef<HTMLDivElement>(null);

  // Refs para evitar closures rancias en los handlers del editor
  const insertMentionRef = useRef<((user: Profile) => void) | null>(null);
  const handleSubmitRef = useRef<(() => void) | null>(null);
  const suggestionsRef = useRef<Profile[]>([]);
  const suggestionIndexRef = useRef(0);
  useEffect(() => { suggestionsRef.current = suggestions; }, [suggestions]);
  useEffect(() => { suggestionIndexRef.current = suggestionIndex; }, [suggestionIndex]);

  // ── Cargar miembros de la mesa (o todos si no hay deskId) ──────────────────
  useEffect(() => {
    if (deskId) {
      // Solo miembros de esta mesa
      api.getDeskMembers(deskId)
        .then((data: unknown) => {
          if (Array.isArray(data)) {
            // getDeskMembers devuelve filas de profiles: { id, nombre, ... }
            const mapped = (data as any[])
              .filter(m => m.nombre)
              .map(m => ({ id: m.id, nombre: m.nombre }));
            setUsers(mapped);
          }
        })
        .catch(() => {
          // Fallback: todos los perfiles
          api.getProfiles().then((d: unknown) => {
            if (Array.isArray(d)) setUsers(d as Profile[]);
          }).catch(() => {});
        });
    } else {
      api.getProfiles().then((data: unknown) => {
        if (Array.isArray(data)) setUsers(data as Profile[]);
      }).catch(() => {});
    }
  }, [deskId]);

  const handleNewComment = useCallback((c: Comment) => {
    setComments((prev) => {
      if (prev.some((x) => x.id === c.id)) return prev;
      return [...prev, c];
    });
  }, []);

  const { emitComment, isConnected } = useCommentsSocket(taskId, handleNewComment);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getComments(taskId)
      .then((data) => { if (!cancelled && Array.isArray(data)) setComments(data); })
      .catch(() => { if (!cancelled) setComments([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId]);

  // ── EMOJI ──────────────────────────────────────────────────────────────────
  const handleEmojiClick = (emojiData: EmojiClickData) => {
    if (editor) {
      editor.chain().focus().insertContent(emojiData.emoji).run();
    }
    setShowEmoji(false);
  };

  // ── IMAGEN ──────────────────────────────────────────────────────────────────
  const attachImage = (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Solo se permiten imágenes'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen no puede superar 5 MB'); return; }
    setPendingImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setPendingImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) attachImage(file);
        return;
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) attachImage(file);
    e.target.value = '';
  };

  const removePendingImage = () => {
    setPendingImage(null);
    setPendingImagePreview(null);
  };

  // ── TIPTAP EDITOR ─────────────────────────────────────────────────────────
  // usersRef para acceder a users sin que el editor se re-cree
  const usersRef = useRef<Profile[]>([]);
  useEffect(() => { usersRef.current = users; }, [users]);

  const mentionHighlightExt = useRef(
    Extension.create({
      name: 'mentionHighlight',
      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: new PluginKey('mentionHighlight'),
            props: {
              decorations(state) {
                const names = usersRef.current.map(u => u.nombre.trim()).filter(Boolean);
                if (names.length === 0) return DecorationSet.empty;
                const decorations: Decoration[] = [];
                state.doc.descendants((node, pos) => {
                  if (!node.isText || !node.text) return;
                  const text = node.text;
                  for (const name of names) {
                    const mention = `@${name}`;
                    let idx = text.indexOf(mention);
                    while (idx !== -1) {
                      decorations.push(
                        Decoration.inline(pos + idx, pos + idx + mention.length, {
                          style: 'color:hsl(var(--primary));font-weight:600;background:hsl(var(--primary)/0.1);border-radius:3px;padding:0 2px',
                        })
                      );
                      idx = text.indexOf(mention, idx + mention.length);
                    }
                  }
                });
                return DecorationSet.create(state.doc, decorations);
              },
            },
          }),
        ];
      },
    })
  ).current;

  const editor = useEditor({
    extensions: [
      // Link and Underline are added below with our own settings.
      StarterKit.configure({ link: false, underline: false }),
      UnderlineExt,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TiptapImage.configure({ inline: true, allowBase64: true }),
      TiptapLink.configure({ openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder: 'Escribe un comentario… usa @ para mencionar' }),
      mentionHighlightExt,
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[80px] max-h-[200px] overflow-y-auto px-3 py-2 text-sm focus:outline-none prose prose-sm dark:prose-invert max-w-none',
      },
      handleKeyDown: (_view, event) => {
        // Navegación en sugerencias de @menciones
        const suggs = suggestionsRef.current;
        if (suggs.length > 0) {
          if (event.key === 'ArrowDown') {
            setSuggestionIndex(i => { const n = Math.min(i + 1, suggs.length - 1); suggestionIndexRef.current = n; return n; });
            return true;
          }
          if (event.key === 'ArrowUp') {
            setSuggestionIndex(i => { const n = Math.max(i - 1, 0); suggestionIndexRef.current = n; return n; });
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            insertMentionRef.current?.(suggs[suggestionIndexRef.current]);
            return true;
          }
          if (event.key === 'Escape') { setSuggestions([]); return true; }
        }
        // Ctrl+Enter para enviar
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          handleSubmitRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const { state } = editor;
      const { selection } = state;
      const { $from } = selection;
      const fullText = $from.parent.textContent;
      const cursorInNode = $from.parentOffset;
      const textUpToCursor = fullText.slice(0, cursorInNode);
      const atIdx = textUpToCursor.lastIndexOf('@');
      if (atIdx !== -1) {
        const q = textUpToCursor.slice(atIdx + 1);
        // Solo activar si no hay espacio doble y la query es corta
        if (!q.includes('  ') && q.length <= 30) {
          const filtered = usersRef.current
            .filter(u => u.nombre.toLowerCase().includes(q.toLowerCase()))
            .slice(0, 6);
          setMentionQuery(q);
          setSuggestions(filtered);
          setSuggestionIndex(0);
          return;
        }
      }
      setMentionQuery('');
      setSuggestions([]);
    },
  });

  // ── MENCIONES ──────────────────────────────────────────────────────────────
  const insertMention = useCallback((user: Profile) => {
    if (!editor) return;
    const { state, dispatch } = editor.view;
    const { selection } = state;
    const { $from } = selection;
    const cursorPos = selection.from;
    const fullText = $from.parent.textContent;
    const cursorInNode = $from.parentOffset;
    const textUpToCursor = fullText.slice(0, cursorInNode);
    const atIdx = textUpToCursor.lastIndexOf('@');
    if (atIdx === -1) return;

    const nodeStart = cursorPos - cursorInNode;
    const deleteFrom = nodeStart + atIdx;
    const deleteTo = cursorPos;

    const tr = state.tr.delete(deleteFrom, deleteTo).insertText(`@${user.nombre.trim()} `, deleteFrom);
    dispatch(tr);
    editor.view.focus();
    setSuggestions([]);
    setMentionQuery('');
  }, [editor]);

  useEffect(() => { insertMentionRef.current = insertMention; }, [insertMention]);

  // ── ENVIAR ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const text = editor.getText().trim();
    if (!text && !pendingImage) return;
    setSending(true);
    try {
      let imageUrl: string | undefined;
      if (pendingImage) {
        setUploadingImage(true);
        try {
          const uploaded = await api.uploadFile(taskId, pendingImage, pendingImage.name);
          imageUrl = uploaded?.url_storage || uploaded?.url || undefined;
        } catch {
          toast.error('No se pudo subir la imagen');
          setUploadingImage(false);
          setSending(false);
          return;
        }
        setUploadingImage(false);
      }

      const contenido_html = html && html !== '<p></p>' ? html : undefined;
      const commentText = text || ' ';
      let saved = false;

      // Intentar por socket si está conectado
      if (isConnected()) {
        try {
          await emitComment(commentText, imageUrl, contenido_html);
          saved = true;
        } catch {
          // Socket falló, caer a REST
        }
      }

      // Fallback REST (siempre si socket no estaba disponible o falló)
      if (!saved) {
        const created = await api.createComment(taskId, commentText, imageUrl, contenido_html);
        if (created?.error) throw new Error(created.error);
        // Agregar localmente solo si vino por REST (socket ya lo hace vía broadcast)
        setComments(prev => {
          if (prev.some(c => c.id === created.id)) return prev;
          return [...prev, created];
        });
      }

      editor.commands.clearContent();
      setSuggestions([]);
      removePendingImage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar comentario');
    } finally {
      setSending(false);
    }
  }, [editor, emitComment, isConnected, pendingImage, taskId]);

  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);

  // ── DELETE COMMENT ────────────────────────────────────────────────────────
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este comentario?')) return;
    setDeletingId(commentId);
    try {
      await api.deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
      toast.success('Comentario eliminado');
    } catch {
      toast.error('No se pudo eliminar el comentario');
    } finally {
      setDeletingId(null);
    }
  };

  // ── LIKES ──────────────────────────────────────────────────────────────────
  const handleLike = async (commentId: string) => {
    try {
      const result = await api.likeComment(commentId);
      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, liked_by_me: result.liked, likes_count: result.likes_count }
          : c
      ));
    } catch {
      toast.error('No se pudo registrar el like');
    }
  };

  const editorIsEmpty = !editor || (editor.getText().trim() === '' && !pendingImage);
  const canSend = !editorIsEmpty && !sending;

  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Comentarios ({comments.length})
      </h4>

      {/* Formulario — position:relative para que el dropdown salga relativo a aquí */}
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="mb-4">
        {/* Wrapper relativo: aquí se posiciona el dropdown de menciones */}
        <div ref={formWrapperRef} className="relative">
          {/* Caja del editor: SIN overflow-hidden para que el dropdown salga */}
          <div className="border border-input rounded-md bg-background focus-within:ring-2 focus-within:ring-ring overflow-visible">
            {/* Toolbar */}
            <RichToolbar editor={editor} />

            {/* Editor area */}
            <div onPaste={handlePaste}>
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* ── Dropdown menciones ── posicionado relativo al form wrapper,
              NO dentro del overflow-hidden del editor */}
          {suggestions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 z-[200] w-60 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
              <div className="px-2 py-1.5 border-b border-border flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50">
                <AtSign className="h-3 w-3" />
                <span>Mencionar a… <span className="text-primary font-medium">@{mentionQuery}</span></span>
              </div>
              {suggestions.map((user, idx) => (
                <button
                  key={user.id}
                  type="button"
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-muted transition-colors',
                    idx === suggestionIndex && 'bg-muted',
                  )}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(user); }}
                  onMouseEnter={() => setSuggestionIndex(idx)}
                >
                  <span className="h-7 w-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                    {getInitials(user.nombre)}
                  </span>
                  <span className="truncate font-medium">{user.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preview imagen pendiente */}
        {pendingImagePreview && (
          <div className="relative mt-2 inline-block">
            <img src={pendingImagePreview} alt="preview" className="max-h-32 max-w-xs rounded-lg border border-border object-cover" />
            <button
              type="button"
              onClick={removePendingImage}
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Emoji picker — también fuera del overflow-hidden */}
        {showEmoji && (
          <div className="relative">
            <div className="absolute bottom-full right-0 mb-1 z-[200]">
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={resolvedTheme === 'dark' ? Theme.DARK : Theme.LIGHT}
                lazyLoadEmojis
                searchPlaceholder="Buscar emoji..."
                width={300}
                height={380}
              />
            </div>
          </div>
        )}

        {/* Barra de herramientas */}
        <div className="flex items-center justify-between mt-2 gap-2">
          <div className="flex items-center gap-1">
            {/* Emoji */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setShowEmoji(v => !v)}
              title="Insertar emoji"
            >
              <Smile className="h-4 w-4" />
            </Button>

            {/* Sin botón de imagen: las capturas se pegan con Ctrl+V en el comentario */}
            {uploadingImage && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

            <span className="text-xs text-muted-foreground ml-1 hidden sm:block">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+Enter</kbd> enviar
            </span>
          </div>

          <Button type="submit" size="sm" disabled={!canSend}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Enviar
          </Button>
        </div>
      </form>

      {/* Lista de comentarios */}
      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No hay comentarios aún. ¡Sé el primero!</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="p-3 rounded-lg bg-muted/50 text-sm group">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    {c.user?.avatar_url ? (
                      <AvatarImage src={c.user.avatar_url} alt={c.user.nombre} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-semibold">
                      {getInitials(c.user?.nombre || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-foreground">{c.user?.nombre || 'Usuario'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(c.created_at), "d MMM, HH:mm", { locale: es })}
                  </span>
                  {(c.user_id === user?.id || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteComment(c.id)}
                      disabled={deletingId === c.id}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded"
                      title="Eliminar comentario"
                    >
                      {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="pl-8">
                {c.contenido_html ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 [&_a]:text-primary [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: highlightMentionsInHtml(c.contenido_html, users.map(u => u.nombre)) }}
                  />
                ) : c.comentario && c.comentario.trim() && c.comentario.trim() !== ' ' ? (
                  <p className="text-foreground/90 whitespace-pre-wrap break-words">
                    {renderCommentText(c.comentario, users.map(u => u.nombre))}
                  </p>
                ) : null}

                {c.image_url && (
                  <a href={c.image_url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                    <img
                      src={c.image_url}
                      alt="imagen adjunta"
                      className="max-h-64 max-w-full rounded-lg border border-border object-contain hover:opacity-90 transition-opacity cursor-pointer"
                    />
                  </a>
                )}

                {/* Like button */}
                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleLike(c.id)}
                    className={cn(
                      'flex items-center gap-1 text-xs rounded-full px-2 py-0.5 transition-colors',
                      c.liked_by_me
                        ? 'text-rose-500 bg-rose-500/10 hover:bg-rose-500/20'
                        : 'text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100',
                    )}
                    title={c.liked_by_me ? 'Quitar like' : 'Me gusta'}
                  >
                    <Heart className={cn('h-3.5 w-3.5', c.liked_by_me && 'fill-current')} />
                    {(c.likes_count ?? 0) > 0 && <span>{c.likes_count}</span>}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Resalta @menciones en azul dentro del texto plano */
function renderCommentText(text: string, userNames: string[]) {
  if (userNames.length === 0) {
    return <span>{text}</span>;
  }
  const escaped = userNames.map(n => n.trim()).filter(Boolean).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(@(?:${escaped.join('|')}))`, 'g');
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    part.startsWith('@') && userNames.some(n => part === `@${n.trim()}`) ? (
      <span key={i} className="text-primary font-semibold bg-primary/10 rounded px-0.5">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Resalta @menciones dentro de HTML — busca @Nombre que ya tenga data-mention o lo envuelve */
function highlightMentionsInHtml(html: string, userNames: string[]): string {
  if (html.includes('data-mention')) return html;
  if (userNames.length === 0) return html;
  const escaped = userNames.map(n => n.trim()).filter(Boolean).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return html;
  const pattern = new RegExp(`(@(?:${escaped.join('|')}))(?=[\\s<.,;:!?)\\]"']|&nbsp;|$)`, 'g');
  return html.replace(
    pattern,
    '<span style="color:hsl(var(--primary));font-weight:600;background:hsl(var(--primary)/0.1);border-radius:3px;padding:0 2px">$1</span>'
  );
}
