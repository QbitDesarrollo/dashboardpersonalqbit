import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Plus,
  Trash2,
  MessageSquare,
  ChevronLeft,
  Bot,
  User,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function GeminiPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setMessage('');
    setSending(true);

    try {
      const res = await api.sendGeminiMessage(text, conversationId || undefined, {
        type: 'tasks',
      });
      setConversationId(res.conversation_id);
      const modelMsg: Message = {
        id: `resp-${Date.now()}`,
        role: 'model',
        content: res.response,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (e: any) {
      let errorText = 'Error al comunicarse con Nerudia. Intenta de nuevo.';
      try {
        const parsed = JSON.parse(e?.message || '');
        if (parsed?.error) errorText = parsed.error;
      } catch {
        if (e?.message?.includes('429')) {
          errorText = 'Demasiadas solicitudes. Espera unos segundos e intenta de nuevo.';
        }
      }
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: errorText,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  };

  const startNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setView('chat');
  };

  const loadConversations = async () => {
    setLoadingHistory(true);
    try {
      const data = await api.getGeminiConversations();
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadConversation = async (id: string) => {
    setLoadingHistory(true);
    try {
      const data = await api.getGeminiConversation(id);
      setConversationId(id);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setView('chat');
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteGeminiConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (conversationId === id) {
        startNewChat();
      }
    } catch {
      // ignore
    }
  };

  const showHistory = () => {
    setView('history');
    loadConversations();
  };

  const formatMessageContent = (content: string) => {
    // Basic markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-xs">$1</code>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'fixed z-50 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110',
          'bg-gradient-to-br from-blue-500 to-purple-600 text-white',
          'bottom-6 right-24'
        )}
        title="Nerudia AI"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed z-50 bottom-20 right-20 w-[380px] h-[520px] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-blue-500/10 to-purple-500/10 shrink-0">
            <div className="flex items-center gap-2">
              {view === 'history' && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView('chat')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <Sparkles className="h-5 w-5 text-blue-500" />
              <span className="font-semibold text-sm">
                {view === 'history' ? 'Historial' : 'Nerudia'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {view === 'chat' && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={showHistory} title="Historial">
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startNewChat} title="Nueva conversación">
                    <Plus className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {view === 'history' ? (
            /* History view */
            <ScrollArea className="flex-1">
              {loadingHistory ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No hay conversaciones previas</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {conversations.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => loadConversation(conv.id)}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{conv.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {new Date(conv.updated_at).toLocaleDateString('es-ES', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 text-destructive"
                          onClick={(e) => deleteConversation(conv.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          ) : (
            /* Chat view */
            <>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 space-y-4">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-3">
                        <Sparkles className="h-7 w-7 text-blue-500" />
                      </div>
                      <p className="text-sm font-medium">Hola, soy Nerudia</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                        Tu asistente AI integrado. Pregúntame sobre tareas, proyectos o cualquier cosa.
                      </p>
                    </div>
                  )}
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex gap-2.5',
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {msg.role === 'model' && (
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      <div
                        className={cn(
                          'max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                        dangerouslySetInnerHTML={{
                          __html: formatMessageContent(msg.content),
                        }}
                      />
                      {msg.role === 'user' && (
                        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                      )}
                    </div>
                  ))}
                  {sending && (
                    <div className="flex gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                        <Bot className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="bg-muted rounded-xl px-3 py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="p-3 border-t border-border shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Pregunta algo..."
                    className="flex-1 h-9 text-sm"
                    disabled={sending}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    disabled={!message.trim() || sending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
