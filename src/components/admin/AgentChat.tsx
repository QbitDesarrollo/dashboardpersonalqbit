import { useEffect, useRef, useState, useCallback } from 'react';
import * as api from '@/lib/apiClient';
import type { AgentMessage } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, ImagePlus, Sparkles, Plus, X, Bot, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function AgentChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = () => setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);

  const loadMessages = useCallback(async (sid: string) => {
    try {
      const r = await api.getAgentMessages(sid);
      setMessages(r.messages);
      setRunning(r.status === 'running');
      scrollToBottom();
      if (r.status !== 'running' && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    } catch { /* */ }
  }, []);

  const startPolling = useCallback((sid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadMessages(sid), 4000);
  }, [loadMessages]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg && pendingImages.length === 0) return;
    if (running) return;
    setInput('');
    const imgs = pendingImages.map((i) => i.path);
    setPendingImages([]);
    // optimista
    setMessages((prev) => [...prev, { id: 'tmp-' + Date.now(), role: 'user', content: msg + (imgs.length ? `\n\n[${imgs.length} imagen(es)]` : ''), created_at: new Date().toISOString() }]);
    setRunning(true);
    scrollToBottom();
    try {
      const r = await api.sendAgentChat(msg, sessionId || undefined, imgs);
      setSessionId(r.session_id);
      startPolling(r.session_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar');
      setRunning(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const { path } = await api.uploadAgentImage(f);
        setPendingImages((prev) => [...prev, { name: f.name, path }]);
      }
    } catch { toast.error('No se pudo subir la imagen'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const newChat = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setSessionId(null); setMessages([]); setInput(''); setPendingImages([]); setRunning(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[420px] border rounded-xl overflow-hidden bg-card">
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Asistente de mantenimiento</span>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">— trabaja en una copia aislada; nada toca producción sin que apruebes</span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={newChat}><Plus className="h-3.5 w-3.5" />Nueva</Button>
      </div>

      {/* mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-10">
            <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
            Pedile que revise un bug, mejore algo o explique código.<br />
            Podés adjuntar capturas con el botón de imagen.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role !== 'user' && <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Bot className="h-4 w-4 text-primary" /></div>}
            <div className={cn('rounded-2xl px-3.5 py-2 max-w-[80%] text-sm whitespace-pre-wrap break-words',
              m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              {m.content}
            </div>
            {m.role === 'user' && <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4" /></div>}
          </div>
        ))}
        {running && (
          <div className="flex gap-2 justify-start">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Bot className="h-4 w-4 text-primary" /></div>
            <div className="rounded-2xl px-3.5 py-2 bg-muted text-sm flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando… (puede tardar un toque)
            </div>
          </div>
        )}
      </div>

      {/* imágenes pendientes */}
      {pendingImages.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-2 border-t bg-muted/20">
          {pendingImages.map((img, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-background border rounded-full px-2 py-1">
              <ImagePlus className="h-3 w-3" /> {img.name.slice(0, 24)}
              <button onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      {/* input */}
      <div className="border-t p-3 flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" disabled={uploading || running} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Escribile al agente… (Enter para enviar, Shift+Enter salto de línea)"
          rows={1}
          className="resize-none min-h-[40px] max-h-32"
          disabled={running}
        />
        <Button className="h-10 shrink-0" onClick={handleSend} disabled={running || (!input.trim() && pendingImages.length === 0)}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
