import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import type { ClientBoard, ClientBoardTask, ClientRequest } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { RichTextViewer } from '@/components/RichTextEditor';
import { ClientCommentBox } from '@/components/clientes/ClientCommentBox';
import { RichEditorField } from '@/components/clientes/RichEditorField';
import { Loader2, Users, Plus, Copy, Check, ExternalLink, ArrowLeft, Inbox, CalendarDays, MessageSquare, FolderKanban } from 'lucide-react';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';

interface Brand { id: string; nombre: string }

function fmt(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); } catch { return s; }
}

const STATUS_LABEL: Record<string, string> = { backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'En revisión', revision_interna: 'Revisión interna', revision_cliente: 'Revisión cliente', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado' };
const STATUS_CLS: Record<string, string> = { backlog: 'bg-slate-100 text-slate-600 border-slate-200', en_proceso: 'bg-blue-100 text-blue-700 border-blue-200', en_revision: 'bg-amber-100 text-amber-700 border-amber-200', revision_interna: 'bg-amber-100 text-amber-700 border-amber-200', revision_cliente: 'bg-purple-100 text-purple-700 border-purple-200', aprobado: 'bg-emerald-100 text-emerald-700 border-emerald-200', entregado: 'bg-green-100 text-green-700 border-green-200', bloqueado: 'bg-rose-100 text-rose-700 border-rose-200' };
const SALUD_DOT: Record<string, string> = { verde: 'bg-emerald-500', amarillo: 'bg-amber-500', rojo: 'bg-rose-500' };

function diasInfo(fechaCliente: string | null, estado: string): { txt: string; cls: string } | null {
  if (!fechaCliente) return null;
  if (['aprobado', 'entregado'].includes(estado)) return { txt: 'Listo', cls: 'text-emerald-600' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dl = new Date(fechaCliente.slice(0, 10) + 'T00:00:00');
  const diff = Math.round((dl.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { txt: `${Math.abs(diff)} d de atraso`, cls: 'text-rose-600 font-medium' };
  if (diff === 0) return { txt: 'Vence hoy', cls: 'text-amber-600 font-medium' };
  return { txt: `Faltan ${diff} d`, cls: 'text-emerald-600' };
}

export default function Clientes() {
  const [boards, setBoards] = useState<ClientBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<ClientBoard | null>(null);

  const load = async () => {
    try { setLoading(true); setBoards(await api.getClientBoards()); }
    catch { toast.error('Error al cargar tableros'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); api.getBrands().then((b: any) => setBrands(Array.isArray(b) ? b.filter((x: any) => x.activo) : [])).catch(() => {}); }, []);

  // Crear tablero
  const [createOpen, setCreateOpen] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newCliente, setNewCliente] = useState('');
  const [creating, setCreating] = useState(false);
  const handleCreate = async () => {
    if (!newBrand) return;
    setCreating(true);
    try {
      await api.createClientBoard({ brand_id: newBrand, cliente_nombre: newCliente.trim() || undefined });
      toast.success('Tablero creado'); setCreateOpen(false); setNewBrand(''); setNewCliente(''); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo crear'); }
    finally { setCreating(false); }
  };

  const [copied, setCopied] = useState<string | null>(null);
  const copyLink = (token: string) => {
    const url = `${window.location.origin}/c/${token}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(token); setTimeout(() => setCopied(null), 2000); });
  };

  if (selected) return <BoardDetail board={selected} onBack={() => { setSelected(null); load(); }} onCopy={copyLink} copied={copied} />;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Users className="h-5 w-5 text-primary" /></div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Tableros de seguimiento para tus clientes. Cada uno tiene un link sin login.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Nuevo tablero</Button>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : boards.length === 0 ? <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">Todavía no hay tableros. Creá uno para tu primer cliente.</CardContent></Card>
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {boards.map((b) => (
              <Card key={b.id} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="cursor-pointer" onClick={() => setSelected(b)}>
                      <div className="font-semibold flex items-center gap-2"><span className={cn('inline-block h-2.5 w-2.5 rounded-full', SALUD_DOT[b.salud || 'verde'])} />{b.brand_nombre}</div>
                      <div className="text-xs text-muted-foreground">{b.cliente_nombre || 'Sin nombre de cliente'}</div>
                    </div>
                    {(b.requests_pendientes ?? 0) > 0 && <Badge className="bg-amber-500">{b.requests_pendientes} solicitud(es)</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${b.avance ?? 0}%`, backgroundColor: (b.vencidas ?? 0) > 0 ? '#ef4444' : '#10b981' }} /></div>
                    <span className="text-xs font-medium text-muted-foreground w-9 text-right">{b.avance ?? 0}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{b.tareas ?? 0} tareas{(b.proyectos ?? 0) > 0 && <> · {b.proyectos} proyecto(s)</>}{(b.vencidas ?? 0) > 0 && <span className="text-rose-500"> · {b.vencidas} vencida(s)</span>}</span>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copyLink(b.token)}>
                        {copied === b.token ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}Link
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelected(b)}>Abrir</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nuevo tablero de cliente</DialogTitle><DialogDescription>Elegí la marca. Se genera un link único sin login para compartir.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Marca *</Label>
              <Select value={newBrand} onValueChange={setNewBrand}>
                <SelectTrigger><SelectValue placeholder="Seleccionar marca" /></SelectTrigger>
                <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Nombre del cliente (opcional)</Label>
              <Input value={newCliente} onChange={(e) => setNewCliente(e.target.value)} placeholder="ej. Antonio" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button onClick={handleCreate} disabled={creating || !newBrand}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BoardDetail({ board, onBack, onCopy, copied }: { board: ClientBoard; onBack: () => void; onCopy: (t: string) => void; copied: string | null }) {
  const [tasks, setTasks] = useState<ClientBoardTask[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'tareas' | 'solicitudes'>('tareas');

  const load = async () => {
    try {
      setLoading(true);
      const [d, r] = await Promise.all([api.getClientBoard(board.id), api.getClientRequests(board.id)]);
      setTasks(d.tasks); setRequests(r);
    } catch { toast.error('Error'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [board.id]);

  // Nueva tarea cara-cliente
  const [taskOpen, setTaskOpen] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState('');
  const [detalle, setDetalle] = useState('');
  const [taskResetKey, setTaskResetKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const createTask = async () => {
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      await api.createClientTask(board.id, { titulo_tarea: titulo.trim(), fecha_cliente: fecha || undefined, detalle: detalle || undefined });
      toast.success('Tarea creada (visible para el cliente + en la agencia)'); setTaskOpen(false); setTitulo(''); setFecha(''); setDetalle(''); setTaskResetKey((k) => k + 1); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); } finally { setSaving(false); }
  };

  const resolve = async (rid: string, accion: 'aprobar' | 'rechazar', fecha_cliente?: string) => {
    try { await api.resolveClientRequest(board.id, rid, accion, fecha_cliente); toast.success(accion === 'aprobar' ? 'Aprobado, tarea creada' : 'Rechazado'); load(); }
    catch { toast.error('Error'); }
  };

  // Detalle de tarea + comentarios (Nicole comenta como ella misma — sin pedir nombre)
  const [openTask, setOpenTask] = useState<ClientBoardTask | null>(null);
  const [comments, setComments] = useState<{ id: string; autor_nombre: string; es_interno: boolean; comentario: string; created_at: string }[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const openDetail = async (t: ClientBoardTask) => {
    setOpenTask(t); setComments([]); setLoadingComments(true);
    try { setComments(await api.getClientTaskComments(board.id, t.id)); } catch { /* */ }
    finally { setLoadingComments(false); }
  };
  const sendComment = async (html: string) => {
    if (!openTask) return;
    const c = await api.postClientTaskComment(board.id, openTask.id, html);
    setComments((prev) => [...prev, c]);
  };

  const pendientes = requests.filter((r) => r.estado === 'pendiente');

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{board.brand_nombre} <span className="text-muted-foreground font-normal text-base">· {board.cliente_nombre}</span></h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => onCopy(board.token)}>{copied === board.token ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}Copiar link</Button>
        <Button size="sm" onClick={() => setTaskOpen(true)}><Plus className="h-4 w-4" />Tarea</Button>
      </div>

      <div className="flex gap-2 border-b">
        <button onClick={() => setTab('tareas')} className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px', tab === 'tareas' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>Tareas ({tasks.length})</button>
        <button onClick={() => setTab('solicitudes')} className={cn('px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5', tab === 'solicitudes' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}>
          <Inbox className="h-3.5 w-3.5" />Solicitudes {pendientes.length > 0 && <Badge className="bg-amber-500 text-[10px] h-4">{pendientes.length}</Badge>}
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : tab === 'tareas' ? (
          tasks.length === 0 ? <p className="text-sm text-muted-foreground text-center py-10">Sin tareas. Creá la primera con "Tarea".</p>
          : (() => {
              const byProj: Record<string, ClientBoardTask[]> = {};
              for (const t of tasks) { const k = t.project_id || '__sin__'; (byProj[k] ||= []).push(t); }
              const groups = Object.entries(byProj).map(([k, items]) => ({ key: k, nombre: k === '__sin__' ? 'Sin proyecto' : (items[0].project_nombre || 'Proyecto'), items }));
              return (
                <div className="space-y-4">
                  {groups.map((g) => (
                    <div key={g.key} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><FolderKanban className="h-4 w-4" />{g.nombre}<Badge variant="secondary" className="text-[10px]">{g.items.length}</Badge></div>
                      <Card><CardContent className="p-0"><table className="w-full text-sm">
                        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase"><tr>
                          <th className="text-left font-medium px-4 py-2.5">Tarea</th><th className="text-left font-medium px-4 py-2.5">Estado</th>
                          <th className="text-left font-medium px-4 py-2.5">Responsable</th>
                          <th className="text-left font-medium px-4 py-2.5">Fecha cliente</th><th className="text-left font-medium px-4 py-2.5">Fecha interna</th><th className="text-left font-medium px-4 py-2.5">Tiempo</th></tr></thead>
                        <tbody className="divide-y">{g.items.map((t) => { const d = diasInfo(t.fecha_cliente, t.estado); return (
                          <tr key={t.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => openDetail(t)}><td className="px-4 py-2.5 font-medium">{t.titulo_tarea}</td>
                            <td className="px-4 py-2.5"><Badge variant="outline" className={cn('text-[10px]', STATUS_CLS[t.estado] || '')}>{STATUS_LABEL[t.estado] || t.estado}</Badge></td>
                            <td className="px-4 py-2.5">{t.responsable_nombre ? <span className="flex items-center gap-1.5"><Avatar className="h-5 w-5">{t.responsable_avatar && <AvatarImage src={t.responsable_avatar} />}<AvatarFallback className="text-[8px]">{getInitials(t.responsable_nombre)}</AvatarFallback></Avatar><span className="text-xs">{t.responsable_nombre}</span></span> : <span className="text-xs text-slate-300">—</span>}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{fmt(t.fecha_cliente)}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{fmt(t.fecha_entrega)}<span className="text-[10px] text-slate-400 ml-1">(equipo)</span></td>
                            <td className="px-4 py-2.5"><span className={cn('text-xs', d?.cls || 'text-muted-foreground')}>{d?.txt || '—'}</span></td></tr>
                        ); })}</tbody></table></CardContent></Card>
                    </div>
                  ))}
                </div>
              );
            })()
        ) : (
          requests.length === 0 ? <p className="text-sm text-muted-foreground text-center py-10">Sin solicitudes del cliente.</p>
          : <div className="space-y-2">{requests.map((r) => (
              <Card key={r.id}><CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{r.titulo} {r.estado !== 'pendiente' && <Badge variant="outline" className={cn('ml-1 text-[10px]', r.estado === 'aprobado' ? 'text-green-700 border-green-200' : 'text-rose-600 border-rose-200')}>{r.estado}</Badge>}</div>
                  {r.detalle && <div className="text-xs text-muted-foreground mt-0.5"><RichTextViewer content={r.detalle} /></div>}
                  <div className="text-[11px] text-muted-foreground mt-1">por {r.autor_nombre} · {fmt(r.created_at)}</div>
                </div>
                {r.estado === 'pendiente' && <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs text-green-700" onClick={() => resolve(r.id, 'aprobar')}>Aprobar</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" onClick={() => resolve(r.id, 'rechazar')}>Rechazar</Button>
                </div>}
              </CardContent></Card>
            ))}</div>
        )}

      {/* Detalle de tarea + comentarios (zona compartida con el cliente) */}
      <Dialog open={!!openTask} onOpenChange={(o) => { if (!o) setOpenTask(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{openTask?.titulo_tarea}</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {openTask && <Badge variant="outline" className="text-[10px]">{openTask.estado}</Badge>}
              <span className="text-xs">Cliente: {fmt(openTask?.fecha_cliente ?? null)} · Interna: {fmt(openTask?.fecha_entrega ?? null)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />Conversación con el cliente</p>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {loadingComments ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto my-4" />
                : comments.length === 0 ? <p className="text-xs text-muted-foreground py-3 text-center">Sin comentarios todavía.</p>
                : comments.map((c) => (
                  <div key={c.id} className={cn('rounded-lg px-3 py-2', c.es_interno ? 'bg-primary/10' : 'bg-muted')}>
                    <div className="text-[11px] text-muted-foreground mb-0.5">{c.es_interno ? '🏢 ' : '👤 '}{c.autor_nombre}</div>
                    <div className="text-sm"><RichTextViewer content={c.comentario} /></div>
                  </div>
                ))}
            </div>
            {openTask && <ClientCommentBox placeholder="Escribe al cliente… (sale con tu usuario)" onSubmit={sendComment} uploadImage={api.uploadEditorImage} />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nueva tarea para el cliente</DialogTitle><DialogDescription>Aparece en el tablero del cliente y, en paralelo, en la agencia. La fecha del cliente queda fija; la interna la ajustás después.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Título *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ej. Diseño campaña Día del Padre" /></div>
            <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Fecha acordada con el cliente</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Detalle (opcional)</Label>
              <RichEditorField placeholder="Brief, referencias, links… puedes pegar imágenes." minHeight="100px" resetKey={taskResetKey} onChange={setDetalle} uploadImage={api.uploadEditorImage} />
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTaskOpen(false)}>Cancelar</Button><Button onClick={createTask} disabled={saving || !titulo.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
