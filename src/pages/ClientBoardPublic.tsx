import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import type { PublicClientTask } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, ExternalLink, MessageSquare, Send, Plus, CalendarDays, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ESTADO_COLOR: Record<string, string> = {
  backlog: 'bg-slate-100 text-slate-700 border-slate-200',
  en_proceso: 'bg-blue-100 text-blue-700 border-blue-200',
  en_revision: 'bg-amber-100 text-amber-700 border-amber-200',
  revision_interna: 'bg-amber-100 text-amber-700 border-amber-200',
  revision_cliente: 'bg-purple-100 text-purple-700 border-purple-200',
  aprobado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  entregado: 'bg-green-100 text-green-700 border-green-200',
  bloqueado: 'bg-rose-100 text-rose-700 border-rose-200',
};

function fmtFecha(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

export default function ClientBoardPublic() {
  const { token = '' } = useParams();
  const [data, setData] = useState<{ titulo: string; marca: string; cliente_nombre: string | null; tasks: PublicClientTask[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nombre, setNombre] = useState<string>('');
  const [askName, setAskName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const NAME_KEY = `client_name_${token}`;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await api.getPublicClientBoard(token);
      setData(d);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) setNombre(saved); else setAskName(true);
    load();
  }, [load, NAME_KEY]);

  const saveName = () => {
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem(NAME_KEY, n);
    setNombre(n);
    setAskName(false);
  };

  // Detalle de tarea (comentarios + entregables)
  const [openTask, setOpenTask] = useState<PublicClientTask | null>(null);
  const [comments, setComments] = useState<{ id: string; autor_nombre: string; es_interno: boolean; comentario: string; created_at: string }[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  const openTaskDetail = async (t: PublicClientTask) => {
    setOpenTask(t); setComments([]); setNewComment(''); setLoadingComments(true);
    try { setComments(await api.getPublicTaskComments(token, t.id)); } catch { /* */ }
    finally { setLoadingComments(false); }
  };
  const sendComment = async () => {
    if (!openTask || !newComment.trim()) return;
    try {
      const c = await api.postPublicComment(token, openTask.id, nombre || 'Cliente', newComment.trim());
      setComments((prev) => [...prev, c]); setNewComment('');
    } catch { toast.error('No se pudo enviar el comentario'); }
  };

  // Pedir requerimiento
  const [reqOpen, setReqOpen] = useState(false);
  const [reqTitulo, setReqTitulo] = useState('');
  const [reqDetalle, setReqDetalle] = useState('');
  const [sendingReq, setSendingReq] = useState(false);
  const sendRequest = async () => {
    if (!reqTitulo.trim()) return;
    setSendingReq(true);
    try {
      await api.postPublicRequest(token, { titulo: reqTitulo.trim(), detalle: reqDetalle.trim() || undefined, autor_nombre: nombre || 'Cliente' });
      toast.success('Solicitud enviada. El equipo la revisará.');
      setReqOpen(false); setReqTitulo(''); setReqDetalle('');
    } catch { toast.error('No se pudo enviar la solicitud'); }
    finally { setSendingReq(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  if (error || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center px-6">
      <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
      <h1 className="text-xl font-bold text-slate-700">Tablero no disponible</h1>
      <p className="text-sm text-slate-500 mt-2">El enlace no es válido o fue desactivado. Escríbele a tu contacto en la agencia.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800">{data.titulo || `Proyectos — ${data.marca}`}</h1>
            <p className="text-xs text-slate-500">{data.marca}{nombre && <> · Hola, {nombre}</>}</p>
          </div>
          <Button size="sm" onClick={() => setReqOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" /> Pedir algo
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {data.tasks.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            Todavía no hay proyectos cargados. Pronto verás aquí el avance.
          </div>
        ) : (
          <>
            {/* Desktop: tabla estilo Monday */}
            <div className="hidden sm:block bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Proyecto</th>
                    <th className="text-left font-medium px-4 py-3">Estado</th>
                    <th className="text-left font-medium px-4 py-3">Fecha</th>
                    <th className="text-left font-medium px-4 py-3">Entregable</th>
                    <th className="text-left font-medium px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openTaskDetail(t)}>
                      <td className="px-4 py-3 font-medium text-slate-800">{t.titulo}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn('font-medium', ESTADO_COLOR[t.estado_raw] || '')}>{t.estado}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-400" />{fmtFecha(t.fecha_cliente)}</span>
                        {t.dias_atraso > 0 && <span className="text-[11px] text-rose-500">{t.dias_atraso}d de atraso</span>}
                      </td>
                      <td className="px-4 py-3">
                        {t.links.length > 0
                          ? <a href={t.links[0]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline text-xs"><ExternalLink className="h-3.5 w-3.5" />Ver</a>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400"><MessageSquare className="h-3.5 w-3.5" /></span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="sm:hidden space-y-3">
              {data.tasks.map((t) => (
                <div key={t.id} className="bg-white rounded-xl border p-4 space-y-2" onClick={() => openTaskDetail(t)}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-800">{t.titulo}</span>
                    <Badge variant="outline" className={cn('shrink-0 text-[10px]', ESTADO_COLOR[t.estado_raw] || '')}>{t.estado}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtFecha(t.fecha_cliente)}{t.dias_atraso > 0 && <span className="text-rose-500 ml-1">({t.dias_atraso}d)</span>}</span>
                    {t.links.length > 0 && <a href={t.links[0]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Ver</a>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Detalle de tarea: entregables + comentarios */}
      <Dialog open={!!openTask} onOpenChange={(o) => { if (!o) setOpenTask(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{openTask?.titulo}</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {openTask && <Badge variant="outline" className={cn('text-[10px]', ESTADO_COLOR[openTask.estado_raw] || '')}>{openTask.estado}</Badge>}
              {openTask?.fecha_cliente && <span className="text-xs">· {fmtFecha(openTask.fecha_cliente)}</span>}
            </DialogDescription>
          </DialogHeader>

          {openTask && openTask.links.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500">Entregables</p>
              {openTask.links.map((l, i) => (
                <a key={i} href={l} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline break-all"><ExternalLink className="h-3.5 w-3.5 shrink-0" />{l}</a>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Comentarios</p>
            <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
              {loadingComments ? <Loader2 className="h-4 w-4 animate-spin text-slate-400 mx-auto my-4" />
                : comments.length === 0 ? <p className="text-xs text-slate-400 py-3 text-center">Sin comentarios todavía.</p>
                : comments.map((c) => (
                  <div key={c.id} className={cn('rounded-lg px-3 py-2 text-sm', c.es_interno ? 'bg-blue-50' : 'bg-slate-100')}>
                    <div className="text-[11px] text-slate-500 mb-0.5">{c.es_interno ? '🏢 ' : ''}{c.autor_nombre}</div>
                    {c.comentario}
                  </div>
                ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Escribe un comentario…" onKeyDown={(e) => { if (e.key === 'Enter') sendComment(); }} />
              <Button size="icon" onClick={sendComment} disabled={!newComment.trim()}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pedir requerimiento */}
      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pedir algo al equipo</DialogTitle>
            <DialogDescription>Cuéntanos qué necesitas. El equipo lo revisa y lo agrega a tus proyectos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={reqTitulo} onChange={(e) => setReqTitulo(e.target.value)} placeholder="¿Qué necesitas? (ej. Banner para la web)" maxLength={200} />
            <Textarea value={reqDetalle} onChange={(e) => setReqDetalle(e.target.value)} placeholder="Detalles (opcional): medidas, referencias, fecha deseada…" rows={3} maxLength={2000} className="resize-none" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqOpen(false)}>Cancelar</Button>
            <Button onClick={sendRequest} disabled={sendingReq || !reqTitulo.trim()}>{sendingReq ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pedir nombre 1ª visita */}
      <Dialog open={askName} onOpenChange={() => { /* obligatorio */ }}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>¡Bienvenido!</DialogTitle>
            <DialogDescription>Para empezar, dinos tu nombre. Lo usaremos para firmar tus comentarios.</DialogDescription>
          </DialogHeader>
          <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Tu nombre (ej. Antonio)" onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} autoFocus />
          <DialogFooter>
            <Button onClick={saveName} disabled={!nameInput.trim()} className="w-full">Entrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="text-center py-6 text-xs text-slate-400">Tablero de seguimiento · Qbit</footer>
    </div>
  );
}
