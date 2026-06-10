import { useEffect, useState, type ReactNode } from 'react';
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
import { ProjectSelect } from '@/components/tasks/ProjectSelect';
import { RichEditorField } from '@/components/clientes/RichEditorField';
import { Loader2, Users, Plus, Copy, Check, ExternalLink, ArrowLeft, Inbox, CalendarDays, MessageSquare, FolderKanban, Trash2, EyeOff, GripVertical, Pencil } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  if (['aprobado', 'entregado'].includes(estado)) return { txt: 'Listo', cls: 'text-emerald-600' };
  // En revisión del cliente: la pelota está del lado del cliente, no cuenta atraso
  if (estado === 'revision_cliente') return { txt: 'En revisión del cliente', cls: 'text-purple-600' };
  if (!fechaCliente) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dl = new Date(fechaCliente.slice(0, 10) + 'T00:00:00');
  const diff = Math.round((dl.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { txt: `${Math.abs(diff)} d de atraso`, cls: 'text-rose-600 font-medium' };
  if (diff === 0) return { txt: 'Vence hoy', cls: 'text-amber-600 font-medium' };
  return { txt: `Faltan ${diff} d`, cls: 'text-emerald-600' };
}


function DroppableGroupCard({ groupKey, children }: { groupKey: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${groupKey}` });
  return <Card ref={setNodeRef} className={cn('transition-shadow', isOver && 'ring-2 ring-primary/50')}>{children}</Card>;
}

function SortableTaskRow({ t, d, onOpen }: { t: ClientBoardTask; d: { txt: string; cls: string } | null; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <tr ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn('hover:bg-muted/40 cursor-pointer', isDragging && 'opacity-60 bg-muted relative z-10')} onClick={onOpen}>
      <td className="pl-2 pr-0 py-2.5 w-7 align-middle" onClick={(e) => e.stopPropagation()}>
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none" title="Arrastra para ordenar o mover a otro proyecto">
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-4 py-2.5 font-medium">{t.titulo_tarea}</td>
      <td className="px-4 py-2.5"><Badge variant="outline" className={cn('text-[10px]', STATUS_CLS[t.estado] || '')}>{STATUS_LABEL[t.estado] || t.estado}</Badge></td>
      <td className="px-4 py-2.5">{t.responsable_nombre ? <span className="flex items-center gap-1.5"><Avatar className="h-5 w-5">{t.responsable_avatar && <AvatarImage src={t.responsable_avatar} />}<AvatarFallback className="text-[8px]">{getInitials(t.responsable_nombre)}</AvatarFallback></Avatar><span className="text-xs">{t.responsable_nombre}</span></span> : <span className="text-xs text-slate-300">—</span>}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{fmt(t.created_at)}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{fmt(t.fecha_cliente)}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{fmt(t.fecha_entrega)}<span className="text-[10px] text-slate-400 ml-1">(equipo)</span></td>
      <td className="px-4 py-2.5"><span className={cn('text-xs', d?.cls || 'text-muted-foreground')}>{d?.txt || '—'}</span></td>
    </tr>
  );
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
  const [estadoNuevo, setEstadoNuevo] = useState('backlog');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [detalle, setDetalle] = useState('');
  const [taskResetKey, setTaskResetKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const createTask = async () => {
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      await api.createClientTask(board.id, { titulo_tarea: titulo.trim(), fecha_cliente: fecha || undefined, detalle: detalle || undefined, estado: estadoNuevo });
      toast.success('Tarea creada (visible para el cliente + en la agencia)'); setTaskOpen(false); setTitulo(''); setFecha(''); setDetalle(''); setEstadoNuevo('backlog'); setTaskResetKey((k) => k + 1); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error'); } finally { setSaving(false); }
  };

  const resolve = async (rid: string, accion: 'aprobar' | 'rechazar', fecha_cliente?: string) => {
    try { await api.resolveClientRequest(board.id, rid, accion, fecha_cliente); toast.success(accion === 'aprobar' ? 'Aprobado, tarea creada' : 'Rechazado'); load(); }
    catch { toast.error('Error'); }
  };

  // Detalle de tarea + comentarios (Nicole comenta como ella misma — sin pedir nombre)
  const [openTask, setOpenTask] = useState<ClientBoardTask | null>(null);
  const [team, setTeam] = useState<{ id: string; nombre: string; avatar_url?: string | null }[]>([]);
  useEffect(() => { api.getProfiles().then((p: any[]) => setTeam(p.filter((x) => x.activo !== 0 && x.rol !== 'cliente'))).catch(() => {}); }, []);
  const [projs, setProjs] = useState<{ id: string; nombre: string }[]>([]);
  const loadProjs = () => { api.getProjects({ brand_id: board.brand_id }).then((r: any) => { const arr = Array.isArray(r) ? r : (r?.projects || []); setProjs(arr.filter((p: any) => p.activo !== 0)); }).catch(() => {}); };
  useEffect(() => { loadProjs(); }, [board.brand_id]);
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

  const changeTaskEstado = async (estado: string) => {
    if (!openTask) return;
    try { await api.patchTask(openTask.id, { estado }); setOpenTask({ ...openTask, estado }); load(); toast.success('Estado actualizado'); }
    catch { toast.error('No se pudo cambiar el estado'); }
  };
  const removeFromBoard = async () => {
    if (!openTask) return;
    if (!window.confirm('¿Quitar esta tarea del tablero del cliente? La tarea sigue existiendo en la agencia, solo deja de verla el cliente.')) return;
    try { await api.patchTask(openTask.id, { cliente_visible: false }); setOpenTask(null); load(); toast.success('Tarea quitada del tablero (sigue en la agencia)'); }
    catch { toast.error('No se pudo quitar'); }
  };
  const deleteTaskForever = async () => {
    if (!openTask) return;
    if (!window.confirm(`¿Eliminar DEFINITIVAMENTE "${openTask.titulo_tarea}"? Esto la borra también de la agencia y no se puede deshacer.`)) return;
    try { await api.deleteTask(openTask.id); setOpenTask(null); load(); toast.success('Tarea eliminada'); }
    catch (e: any) { toast.error(e?.message || 'No se pudo eliminar'); }
  };
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = async (ev: DragEndEvent) => {
    const activeId = String(ev.active.id);
    const overId = ev.over ? String(ev.over.id) : null;
    if (!overId || activeId === overId) return;
    const a = tasks.find((t) => t.id === activeId);
    if (!a) return;
    if (overId.startsWith('group:')) {
      const targetKey = overId.slice(6);
      const targetProj = targetKey === '__sin__' ? null : targetKey;
      if ((a.project_id || null) === targetProj) return;
      try {
        await api.patchTask(activeId, { project_id: targetProj, sort_order: 9999 });
        toast.success(targetProj ? 'Tarea movida al proyecto' : 'Tarea movida a "Sin proyecto"');
        load();
      } catch { toast.error('No se pudo mover la tarea'); }
      return;
    }
    const o = tasks.find((t) => t.id === overId);
    if (!o) return;
    const aProj = a.project_id || null;
    const oProj = o.project_id || null;
    try {
      if (aProj === oProj) {
        // Reordenar dentro del mismo proyecto
        const group = tasks.filter((t) => (t.project_id || null) === aProj);
        const ids = group.map((t) => t.id);
        const newGroup = arrayMove(group, ids.indexOf(activeId), ids.indexOf(overId));
        const queue = [...newGroup];
        setTasks((prev) => prev.map((t) => ((t.project_id || null) === aProj ? queue.shift()! : t)));
        await Promise.all(newGroup.map((t, i) => (t.sort_order === i ? Promise.resolve() : api.patchTask(t.id, { sort_order: i }))));
        load();
      } else {
        // Mover a otro proyecto (cae en la posición de la fila destino)
        await api.patchTask(activeId, { project_id: oProj, sort_order: (o.sort_order ?? 0) });
        toast.success(oProj ? 'Tarea movida de proyecto' : 'Tarea movida a "Sin proyecto"');
        load();
      }
    } catch { toast.error('No se pudo mover la tarea'); load(); }
  };
  const renameTask = async () => {
    if (!openTask) return;
    const nuevo = window.prompt('Nuevo nombre de la tarea:', openTask.titulo_tarea);
    if (!nuevo || !nuevo.trim() || nuevo.trim() === openTask.titulo_tarea) return;
    try { await api.patchTask(openTask.id, { titulo_tarea: nuevo.trim() }); setOpenTask({ ...openTask, titulo_tarea: nuevo.trim() }); load(); toast.success('Nombre actualizado'); }
    catch { toast.error('No se pudo renombrar'); }
  };
  const renameProject = async (projectId: string, actual: string) => {
    const nuevo = window.prompt('Nuevo nombre del proyecto:', actual);
    if (!nuevo || !nuevo.trim() || nuevo.trim() === actual) return;
    try { await api.patchProject(projectId, { nombre: nuevo.trim() }); load(); toast.success('Proyecto renombrado'); }
    catch { toast.error('No se pudo renombrar el proyecto'); }
  };
  const changeTaskResp = async (uid: string) => {
    if (!openTask) return;
    const val = uid === '__none__' ? null : uid;
    try { await api.patchTask(openTask.id, { responsable_user_id: val }); setOpenTask({ ...openTask, responsable_user_id: val }); load(); toast.success('Responsable actualizado'); }
    catch { toast.error('No se pudo asignar'); }
  };
  const quickCreateProject = async () => {
    const nombre = window.prompt('Nombre del nuevo proyecto:');
    if (!nombre || !nombre.trim()) return;
    try {
      const p = await api.createProject({ brand_id: board.brand_id, nombre: nombre.trim() });
      toast.success('Proyecto creado');
      loadProjs();
      if (openTask) { await api.patchTask(openTask.id, { project_id: p.id }); setOpenTask({ ...openTask, project_id: p.id }); }
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo crear el proyecto'); }
  };
  const changeTaskProject = async (pid: string | null) => {
    if (!openTask) return;
    try { await api.patchTask(openTask.id, { project_id: pid }); setOpenTask({ ...openTask, project_id: pid }); load(); toast.success('Proyecto actualizado'); }
    catch { toast.error('No se pudo asignar el proyecto'); }
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
          tasks.length === 0 ? <p className="text-sm text-muted-foreground text-center py-10">Sin tareas. Crea la primera con "Tarea".</p>
          : (() => {
              const visibles = filtroEstado === 'todos' ? tasks : tasks.filter((t) => t.estado === filtroEstado);
              const byProj: Record<string, ClientBoardTask[]> = {};
              for (const t of visibles) { const k = t.project_id || '__sin__'; (byProj[k] ||= []).push(t); }
              // Todos los proyectos de la marca (aunque estén vacíos) + restos + sin proyecto
              const conocidos = new Set(projs.map((p) => p.id));
              let groups = [
                ...projs.map((p) => ({ key: p.id, nombre: p.nombre, items: byProj[p.id] || [] })),
                ...Object.entries(byProj).filter(([k]) => k !== '__sin__' && !conocidos.has(k)).map(([k, items]) => ({ key: k, nombre: items[0].project_nombre || 'Proyecto', items })),
                ...(byProj['__sin__'] ? [{ key: '__sin__', nombre: 'Sin proyecto', items: byProj['__sin__'] }] : []),
              ];
              if (filtroEstado !== 'todos') groups = groups.filter((g) => g.items.length > 0);
              const estadosPresentes = Array.from(new Set(tasks.map((t) => t.estado)));
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={() => setFiltroEstado('todos')} className={cn('px-2.5 py-1 rounded-full text-xs border transition-colors', filtroEstado === 'todos' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted')}>
                      Todos ({tasks.length})
                    </button>
                    {estadosPresentes.map((e) => (
                      <button key={e} onClick={() => setFiltroEstado(filtroEstado === e ? 'todos' : e)} className={cn('px-2.5 py-1 rounded-full text-xs border transition-colors', filtroEstado === e ? STATUS_CLS[e] + ' ring-1 ring-current' : 'bg-background text-muted-foreground hover:bg-muted')}>
                      {STATUS_LABEL[e] || e} ({tasks.filter((t) => t.estado === e).length})
                      </button>
                    ))}
                  </div>
                  {visibles.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Ninguna tarea con este estado.</p>}
                  <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  {groups.map((g) => (
                    <div key={g.key} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground group/hdr">
                        <FolderKanban className="h-4 w-4" />{g.nombre}<Badge variant="secondary" className="text-[10px]">{g.items.length}</Badge>
                        {g.key !== '__sin__' && (
                          <button onClick={() => renameProject(g.key, g.nombre)} className="opacity-0 group-hover/hdr:opacity-100 text-muted-foreground/60 hover:text-foreground transition-opacity" title="Renombrar proyecto">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <DroppableGroupCard groupKey={g.key}><CardContent className="p-0"><table className="w-full text-sm">
                        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase"><tr>
                          <th className="w-7"></th>
                          <th className="text-left font-medium px-4 py-2.5">Tarea</th><th className="text-left font-medium px-4 py-2.5">Estado</th>
                          <th className="text-left font-medium px-4 py-2.5">Responsable</th>
                          <th className="text-left font-medium px-4 py-2.5">Creada</th>
                          <th className="text-left font-medium px-4 py-2.5">Fecha cliente</th><th className="text-left font-medium px-4 py-2.5">Fecha interna</th><th className="text-left font-medium px-4 py-2.5">Tiempo</th></tr></thead>
                        <tbody className="divide-y">
                          <SortableContext items={g.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                            {g.items.map((t) => <SortableTaskRow key={t.id} t={t} d={diasInfo(t.fecha_cliente, t.estado)} onOpen={() => openDetail(t)} />)}
                          </SortableContext>
                          {g.items.length === 0 && (
                            <tr><td colSpan={8} className="px-4 py-5 text-center text-xs text-muted-foreground">
                              Sin tareas todavía — arrastra una hasta aquí o asígnala con el selector "Proyecto".
                            </td></tr>
                          )}
                        </tbody></table></CardContent></DroppableGroupCard>
                    </div>
                  ))}
                  </DndContext>
                </div>
              );
            })()
        ) : (
          requests.length === 0 ? <p className="text-sm text-muted-foreground text-center py-10">Sin solicitudes del cliente.</p>
          : <div className="space-y-2">{[...requests].sort((a, b) => (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1)).map((r) => (
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{openTask?.titulo_tarea}
              <button onClick={renameTask} className="text-muted-foreground/60 hover:text-foreground" title="Renombrar tarea"><Pencil className="h-3.5 w-3.5" /></button>
            </DialogTitle>
            <DialogDescription>
              <span className="text-xs">Creada: {fmt(openTask?.created_at ?? null)} · Cliente: {fmt(openTask?.fecha_cliente ?? null)} · Interna: {fmt(openTask?.fecha_entrega ?? null)}</span>
            </DialogDescription>
          </DialogHeader>
          {openTask && (
            <div className="space-y-3 pb-3 border-b">
              {openTask.detalle && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 max-h-44 overflow-y-auto">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">Detalle / brief</p>
                  <div className="text-sm"><RichTextViewer content={openTask.detalle} /></div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Estado</Label>
                  <Select value={openTask.estado} onValueChange={changeTaskEstado}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Responsable</Label>
                  <Select value={openTask.responsable_user_id || '__none__'} onValueChange={changeTaskResp}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin asignar</SelectItem>
                      {team.map((u) => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Proyecto</Label>
                  <div className="flex items-center gap-1">
                    <div className="flex-1 min-w-0"><ProjectSelect brandId={board.brand_id} value={openTask.project_id} onChange={changeTaskProject} /></div>
                    <Button variant="outline" size="sm" className="h-9 px-2 shrink-0" onClick={quickCreateProject} title="Crear proyecto nuevo">+</Button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => window.open(`/tareas?task=${openTask.id}`, '_blank')} title="Abre la vista completa: subtareas, archivos, timer, todo">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />Abrir en Tareas (subtareas y más)
                </Button>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="text-muted-foreground h-8 px-2" onClick={removeFromBoard} title="El cliente deja de verla; sigue en la agencia">
                    <EyeOff className="h-3.5 w-3.5 mr-1" />Quitar del tablero
                  </Button>
                  <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 h-8 px-2" onClick={deleteTaskForever} title="Borra la tarea definitivamente">
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar
                  </Button>
                </div>
              </div>
            </div>
          )}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Nueva tarea para el cliente</DialogTitle><DialogDescription>Aparece en el tablero del cliente y, en paralelo, en la agencia. La fecha del cliente queda fija; la interna la ajustas después.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Título *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ej. Diseño campaña Día del Padre" /></div>
            <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Fecha acordada con el cliente</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Estado inicial</Label>
              <Select value={estadoNuevo} onValueChange={setEstadoNuevo}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Para migrar tareas viejas ya entregadas, usa "Entregado" y no contarán atraso.</p>
            </div>
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
