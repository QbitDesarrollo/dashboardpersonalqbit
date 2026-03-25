import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useDeskChat, type ChatMessage, type ChatReaction, type PresenceStatus, type MemberPresence } from '@/hooks/useDeskChat';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2, Send, ChevronUp, Check, CheckCheck, Circle, SmilePlus, Smile, AtSign, ImagePlus, X } from 'lucide-react';
import * as api from '@/lib/apiClient';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useTheme } from 'next-themes';

interface DeskChatProps {
  deskId: string;
  deskName: string;
  soundEnabled?: boolean;
  soundType?: 'chime' | 'bell' | 'pop' | 'ding' | 'soft';
  members?: { id: string; nombre: string; avatar_url?: string | null }[];
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function groupMessagesByDate(messages: ChatMessage[]): { date: string; messages: ChatMessage[] }[] {
  const groups: { date: string; messages: ChatMessage[] }[] = [];
  let currentDate = '';
  for (const msg of messages) {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }
  return groups;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉', '💯', '✅', '👀', '🙏', '🚀', '💪', '😍', '🤔', '😅', '👎', '💀', '🫡'];

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

function renderTextWithLinks(text: string, isOwn: boolean, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    URL_REGEX.lastIndex = 0;
    if (URL_REGEX.test(part)) {
      return (
        <a
          key={`${keyPrefix}-l${i}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'underline break-all',
            isOwn ? 'text-white/90 hover:text-white' : 'text-primary hover:text-primary/80'
          )}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function highlightMentions(text: string, memberNames: string[], isOwn: boolean): React.ReactNode[] {
  // First split by mentions
  if (memberNames.length > 0) {
    const escaped = memberNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const mentionRegex = new RegExp(`(@(?:${escaped.join('|')}))`, 'gi');
    const parts = text.split(mentionRegex);
    return parts.flatMap((part, i) => {
      mentionRegex.lastIndex = 0;
      if (mentionRegex.test(part)) {
        return (
          <span key={`m${i}`} className={cn(
            'font-semibold rounded px-0.5',
            isOwn ? 'text-white bg-white/20' : 'text-primary bg-primary/10'
          )}>{part}</span>
        );
      }
      // For non-mention parts, check for URLs
      return renderTextWithLinks(part, isOwn, `p${i}`);
    });
  }
  // No members, just check for URLs
  return renderTextWithLinks(text, isOwn, 'r');
}

function groupReactions(reactions: ChatReaction[]): { emoji: string; users: { user_id: string; nombre: string }[] }[] {
  const map = new Map<string, { user_id: string; nombre: string }[]>();
  for (const r of reactions) {
    if (!map.has(r.emoji)) map.set(r.emoji, []);
    map.get(r.emoji)!.push({ user_id: r.user_id, nombre: r.nombre });
  }
  return Array.from(map.entries()).map(([emoji, users]) => ({ emoji, users }));
}

function MessageReactions({ msg, currentUserId, onToggle }: {
  msg: ChatMessage;
  currentUserId: string;
  onToggle: (emoji: string) => void;
}) {
  const grouped = useMemo(() => groupReactions(msg.reactions || []), [msg.reactions]);
  if (grouped.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {grouped.map(({ emoji, users }) => {
        const isMine = users.some(u => u.user_id === currentUserId);
        const names = users.map(u => u.nombre).filter(Boolean).join(', ');
        return (
          <button
            key={emoji}
            onClick={() => onToggle(emoji)}
            title={names}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs border transition-colors',
              isMine
                ? 'bg-primary/10 border-primary/30 hover:bg-primary/20'
                : 'bg-muted/50 border-border hover:bg-muted'
            )}
          >
            <span>{emoji}</span>
            <span className="text-[10px] font-medium text-muted-foreground">{users.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function QuickReactionBar({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-popover border border-border rounded-full shadow-sm px-1 py-0.5">
      {QUICK_EMOJIS.slice(0, 6).map(emoji => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="text-sm hover:scale-125 transition-transform leading-none p-0.5"
          title={emoji}
        >
          {emoji}
        </button>
      ))}
      <MoreEmojisPopover onSelect={onSelect} />
    </div>
  );
}

function MoreEmojisPopover({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-sm hover:scale-110 transition-transform p-0.5 text-muted-foreground" title="Más emojis">
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" side="top" align="center">
        <div className="grid grid-cols-5 gap-1">
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => { onSelect(emoji); setOpen(false); }}
              className="text-lg hover:bg-muted rounded p-1.5 transition-colors leading-none"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReadReceipts({ msg, currentUserId, members }: {
  msg: ChatMessage;
  currentUserId: string;
  members: { id: string; nombre: string }[];
}) {
  // Only show receipts for own messages
  if (msg.user_id !== currentUserId) return null;

  const otherMembers = members.filter(m => m.id !== currentUserId);
  const readByOthers = msg.read_by.filter(r => r.user_id !== currentUserId);
  const allRead = otherMembers.length > 0 && readByOthers.length >= otherMembers.length;

  if (allRead) {
    return (
      <span title={`Visto por: ${readByOthers.map(r => r.nombre || members.find(m => m.id === r.user_id)?.nombre || '').filter(Boolean).join(', ')}`}>
        <CheckCheck className="h-3.5 w-3.5 text-blue-500 inline" />
      </span>
    );
  }

  if (readByOthers.length > 0) {
    return (
      <span title={`Visto por: ${readByOthers.map(r => r.nombre || members.find(m => m.id === r.user_id)?.nombre || '').filter(Boolean).join(', ')}`}>
        <CheckCheck className="h-3.5 w-3.5 text-muted-foreground inline" />
      </span>
    );
  }

  return <Check className="h-3.5 w-3.5 text-muted-foreground inline" />;
}

export function DeskChat({ deskId, deskName, soundEnabled = true, soundType = 'chime', members = [] }: DeskChatProps) {
  const { profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const currentUserId = profile?.id || '';
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionStartRef = useRef<number>(-1);

  const memberNames = useMemo(() => members.map(m => m.nombre), [members]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter(m => m.id !== currentUserId && m.nombre.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQuery, members, currentUserId]);

  const { messages, loading, hasMore, loadMore, onlineUsers, memberPresence, connected, sendMessage, markAsRead, toggleReaction } = useDeskChat({
    deskId,
    currentUserId,
    soundEnabled,
    soundType,
  });

  const messageGroups = useMemo(() => groupMessagesByDate(messages), [messages]);

  const getPresenceStatus = useCallback((userId: string): PresenceStatus => {
    const p = memberPresence.find(mp => mp.userId === userId);
    if (p) return p.status;
    return onlineUsers.includes(userId) ? 'online' : 'offline';
  }, [memberPresence, onlineUsers]);

  const activeCount = useMemo(() => {
    return members.filter(m => getPresenceStatus(m.id) === 'online').length;
  }, [members, getPresenceStatus]);

  const awayCount = useMemo(() => {
    return members.filter(m => getPresenceStatus(m.id) === 'away').length;
  }, [members, getPresenceStatus]);

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  useEffect(() => {
    if (!currentUserId || messages.length === 0) return;
    const unreadIds = messages
      .filter(m => m.user_id !== currentUserId && !m.read_by.some(r => r.user_id === currentUserId))
      .map(m => m.id);
    if (unreadIds.length > 0) {
      markAsRead(unreadIds);
    }
  }, [messages, currentUserId, markAsRead]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setAutoScroll(isNearBottom);
  };

  const insertMention = useCallback((member: { id: string; nombre: string }) => {
    const ta = textareaRef.current;
    if (!ta || mentionStartRef.current < 0) return;
    const before = text.slice(0, mentionStartRef.current);
    const after = text.slice(ta.selectionStart);
    const newText = `${before}@${member.nombre} ${after}`;
    setText(newText);
    setMentionQuery(null);
    mentionStartRef.current = -1;
    setTimeout(() => {
      const pos = before.length + member.nombre.length + 2;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    }, 0);
  }, [text]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const pos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, pos);
    const atIdx = textBeforeCursor.lastIndexOf('@');
    if (atIdx >= 0) {
      const charBefore = atIdx > 0 ? textBeforeCursor[atIdx - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIdx === 0) {
        const query = textBeforeCursor.slice(atIdx + 1);
        if (!query.includes(' ') || query.length <= 30) {
          mentionStartRef.current = atIdx;
          setMentionQuery(query);
          setMentionIndex(0);
          return;
        }
      }
    }
    setMentionQuery(null);
    mentionStartRef.current = -1;
  }, []);

  const handleEmojiSelect = useCallback((emojiData: EmojiClickData) => {
    const ta = textareaRef.current;
    const emoji = emojiData.emoji;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newText = text.slice(0, start) + emoji + text.slice(end);
      setText(newText);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setText(prev => prev + emoji);
    }
    setEmojiOpen(false);
  }, [text]);

  const processImageFile = useCallback((file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen no puede superar 5MB');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
    e.target.value = '';
  }, [processImageFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) processImageFile(file);
        return;
      }
    }
  }, [processImageFile]);

  const clearImage = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
  }, []);

  const handleSend = async () => {
    if ((!text.trim() && !imageFile) || sending) return;
    setMentionQuery(null);
    setSending(true);
    try {
      let uploadedImageUrl: string | undefined;
      if (imageFile) {
        setUploading(true);
        const res = await api.uploadChatImage(imageFile);
        uploadedImageUrl = res.image_url;
        setUploading(false);
      }
      await sendMessage(text, uploadedImageUrl);
      setText('');
      clearImage();
      setAutoScroll(true);
      textareaRef.current?.focus();
    } catch (e) {
      console.error('[DeskChat] Send error:', e);
      setUploading(false);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-semibold text-foreground">{deskName}</h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {connected ? (
              <>
                {activeCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">{activeCount}</span>
                  </span>
                )}
                {awayCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Circle className="h-2 w-2 fill-amber-400 text-amber-400" />
                    <span className="text-amber-600 dark:text-amber-400">{awayCount}</span>
                  </span>
                )}
                <span>· {members.length} miembros</span>
              </>
            ) : (
              <>
                <Circle className="h-2 w-2 fill-muted-foreground text-muted-foreground" />
                <span>Conectando...</span>
              </>
            )}
          </div>
        </div>
        {/* Members with presence indicators */}
        <div className="flex -space-x-2">
          {members
            .filter(m => getPresenceStatus(m.id) !== 'offline')
            .slice(0, 6)
            .map(m => {
              const status = getPresenceStatus(m.id);
              const dotColor = status === 'online' ? 'bg-green-500' : 'bg-amber-400';
              const statusLabel = status === 'online' ? 'En línea' : 'Ausente';
              return (
                <div key={m.id} className="relative" title={`${m.nombre} - ${statusLabel}`}>
                  <Avatar className="h-7 w-7 border-2 border-background">
                    {m.avatar_url ? (
                      <AvatarImage src={m.avatar_url} alt={m.nombre} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                      {getInitials(m.nombre)}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background', dotColor)} />
                </div>
              );
            })}
          {members.filter(m => getPresenceStatus(m.id) !== 'offline').length > 6 && (
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium border-2 border-background">
              +{members.filter(m => getPresenceStatus(m.id) !== 'offline').length - 6}
            </div>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1 bg-muted/20"
        onScroll={handleScroll}
      >
        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading} className="text-xs">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ChevronUp className="h-4 w-4 mr-1" />}
              Cargar anteriores
            </Button>
          </div>
        )}

        {loading && messages.length === 0 && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
            <p>No hay mensajes aún</p>
            <p className="text-xs mt-1">Envía el primer mensaje a esta mesa</p>
          </div>
        )}

        {messageGroups.map((group) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="flex items-center justify-center py-2">
              <span className="text-[11px] bg-muted/80 text-muted-foreground px-3 py-0.5 rounded-full">
                {formatDateSeparator(group.date)}
              </span>
            </div>

            {group.messages.map((msg, idx) => {
              const isOwn = msg.user_id === currentUserId;
              const prevMsg = idx > 0 ? group.messages[idx - 1] : null;
              const sameUser = prevMsg?.user_id === msg.user_id;
              const showName = !isOwn && !sameUser;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex group',
                    isOwn ? 'justify-end' : 'justify-start',
                    sameUser ? 'mt-0.5' : 'mt-2'
                  )}
                >
                  {/* Avatar for others */}
                  {!isOwn && !sameUser && (
                    <Avatar className="h-7 w-7 mt-1 mr-1.5 shrink-0">
                      {msg.user?.avatar_url ? (
                        <AvatarImage src={msg.user.avatar_url} alt={msg.user.nombre} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                        {getInitials(msg.user?.nombre || '?')}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  {!isOwn && sameUser && <div className="w-7 mr-1.5 shrink-0" />}

                  <div className={cn('max-w-[75%] flex flex-col', isOwn ? 'items-end' : 'items-start')}>
                    {/* Message bubble */}
                    <div className="relative flex items-center gap-1">
                      {isOwn && (
                        <QuickReactionBar onSelect={(emoji) => toggleReaction(msg.id, emoji)} />
                      )}
                      <div
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-sm break-words',
                          isOwn
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-card border border-border rounded-bl-sm'
                        )}
                      >
                        {showName && (
                          <p className={cn('text-xs font-semibold mb-0.5', isOwn ? 'text-primary-foreground/80' : 'text-primary')}>
                            {msg.user?.nombre || 'Usuario'}
                          </p>
                        )}
                        {msg.image_url && (
                          <img
                            src={msg.image_url}
                            alt="Imagen"
                            className="rounded max-w-[260px] max-h-[200px] object-cover cursor-pointer mb-1"
                            onClick={() => window.open(msg.image_url!, '_blank')}
                          />
                        )}
                        {msg.mensaje && <p className="whitespace-pre-wrap">{highlightMentions(msg.mensaje, memberNames, isOwn)}</p>}
                        <div className={cn('flex items-center justify-end gap-1 mt-0.5', isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                          <span className="text-[10px]">{formatTime(msg.created_at)}</span>
                          <ReadReceipts msg={msg} currentUserId={currentUserId} members={members} />
                        </div>
                      </div>
                      {!isOwn && (
                        <QuickReactionBar onSelect={(emoji) => toggleReaction(msg.id, emoji)} />
                      )}
                    </div>
                    {/* Reactions */}
                    <MessageReactions msg={msg} currentUserId={currentUserId} onToggle={(emoji) => toggleReaction(msg.id, emoji)} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-border bg-card shrink-0 relative">
        {/* Mention suggestions dropdown */}
        {mentionSuggestions.length > 0 && (
          <div className="mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
            {mentionSuggestions.map((member, idx) => (
              <button
                key={member.id}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  idx === mentionIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                )}
                onMouseDown={(e) => { e.preventDefault(); insertMention(member); }}
                onMouseEnter={() => setMentionIndex(idx)}
              >
                <Avatar className="h-6 w-6 shrink-0">
                  {member.avatar_url ? (
                    <AvatarImage src={member.avatar_url} alt={member.nombre} className="object-cover" />
                  ) : null}
                  <AvatarFallback className="text-[9px] bg-primary/20 text-primary">
                    {getInitials(member.nombre)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{member.nombre}</span>
              </button>
            ))}
          </div>
        )}
        {/* Emoji picker floating panel */}
        {emojiOpen && (
          <div className="absolute bottom-full left-0 mb-2 z-50 shadow-xl rounded-lg overflow-hidden">
            <EmojiPicker
              onEmojiClick={(data) => { handleEmojiSelect(data); }}
              theme={resolvedTheme === 'dark' ? Theme.DARK : Theme.LIGHT}
              width={320}
              height={400}
              searchPlaceHolder="Buscar emoji..."
              previewConfig={{ showPreview: false }}
              lazyLoadEmojis
            />
          </div>
        )}
        {emojiOpen && (
          <div className="fixed inset-0 z-40" onClick={() => setEmojiOpen(false)} />
        )}
        {/* Image preview */}
        {imagePreview && (
          <div className="mb-2 relative inline-block">
            <img src={imagePreview} alt="Preview" className="max-h-24 rounded-lg border border-border" />
            <button
              onClick={clearImage}
              className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleImageSelect}
        />
        <div className="flex items-end gap-1.5 relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-[38px] w-[38px] shrink-0"
            title="Emojis"
            disabled={!connected}
            onClick={() => setEmojiOpen(prev => !prev)}
            type="button"
          >
            <Smile className="h-5 w-5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-[38px] w-[38px] shrink-0"
            title="Enviar imagen"
            disabled={!connected}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <ImagePlus className="h-5 w-5 text-muted-foreground" />
          </Button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Escribe un mensaje... (@mencionar)"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-32"
            style={{ minHeight: '38px' }}
            disabled={!connected}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!text.trim() && !imageFile) || sending || !connected}
            className="h-[38px] w-[38px] shrink-0"
          >
            {sending || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
