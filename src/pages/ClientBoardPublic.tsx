import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import type { PublicClientTask, PublicProject } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { RichTextViewer } from '@/components/RichTextEditor';
import { ClientCommentBox } from '@/components/clientes/ClientCommentBox';
import { RichEditorField } from '@/components/clientes/RichEditorField';
import {
  Loader2, ExternalLink, Plus, CalendarDays, AlertCircle, CheckCircle2, ThumbsUp, RotateCcw,
  GripVertical, LayoutGrid, List as ListIcon, ChevronDown, ChevronRight, MessageSquare, Send,
  FolderKanban, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const COLS: { key: string; label: string; raws: string[]; color: string }[] = [
  { key: 'pendiente', label: 'Pendiente', raws: ['backlog'], color: '#64748b' },
  { key: 'en_proceso', label: 'En proceso', raws: ['en_proceso', 'en_revision', 'revision_interna', 'bloqueado'], color: '#3b82f6' },
  { key: 'revision', label: 'Para tu revisión', raws: ['revision_cliente'], color: '#a855f7' },
  { key: 'aprobado', label: 'Aprobado', raws: ['aprobado'], color: '#10b981' },
  { key: 'entregado', label: 'Entregado', raws: ['entregado'], color: '#22c55e' },
];
function colOf(raw: string): string { return COLS.find((c) => c.raws.includes(raw))?.key || 'pendiente'; }
function fmtFecha(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; }
}
function fmtCorta(s: string | null): string {
  if (!s) return '—';
  try { return new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); } catch { return s; }
}
// Días: atraso (vencido) o cuánto falta (disponible). Null si ya está cerrada.
function diasInfo(fechaCliente: string | null, estadoRaw: string): { txt: string; cls: string } | null {
  if (['aprobado', 'entregado'].includes(estadoRaw)) return { txt: 'Listo', cls: 'text-emerald-600' };
  // Si está esperando al cliente, el reloj se detiene: no es atraso de la agencia
  if (estadoRaw === 'revision_cliente') return { txt: 'Esperando tu revisión', cls: 'text-purple-600 font-medium' };
  if (!fechaCliente) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dl = new Date(fechaCliente.slice(0, 10) + 'T00:00:00');
  const diff = Math.round((dl.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { txt: `${Math.abs(diff)} d de atraso`, cls: 'text-rose-600 font-medium' };
  if (diff === 0) return { txt: 'Vence hoy', cls: 'text-amber-600 font-medium' };
  return { txt: `Faltan ${diff} d`, cls: 'text-emerald-600' };
}

function KanbanCard({ t, onOpen, editor = false }: { t: PublicClientTask; onOpen: () => void; editor?: boolean }) {
  const draggable = editor ? t.estado_raw !== 'entregado' : t.estado_raw === 'revision_cliente';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, disabled: !draggable });
  return (
    <div ref={setNodeRef} className={cn('bg-white rounded-lg border p-3 space-y-2 shadow-sm', isDragging && 'opacity-40')}>
      <div className="flex items-start gap-1.5">
        {draggable && <span {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing text-slate-300 mt-0.5"><GripVertical className="h-4 w-4" /></span>}
        <span className="font-medium text-sm text-slate-800 flex-1 cursor-pointer" onClick={onOpen}>{t.titulo}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500 pl-0.5">
        <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Entrega {fmtCorta(t.fecha_cliente)}</span>
        {(() => { const d = diasInfo(t.fecha_cliente, t.estado_raw); return d ? <span className={d.cls}>{d.txt}</span> : null; })()}
      </div>
      <div className="text-[10px] text-slate-400 pl-0.5">Creada {fmtCorta(t.creada)}</div>
      {t.links.length > 0 && <a href={t.links[0]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" />Entregable</a>}
      {t.estado_raw === 'revision_cliente' && <div className="text-[10px] text-purple-500 pl-0.5">↔ Arrastra para aprobar o pedir cambios</div>}
      {t.departamento && <div className="text-[10px] text-slate-400 pl-0.5">{t.departamento}</div>}
    </div>
  );
}

function Column({ col, tasks, onOpen, editor = false }: { col: typeof COLS[number]; tasks: PublicClientTask[]; onOpen: (t: PublicClientTask) => void; editor?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${col.key}` });
  return (
    <div className="flex-shrink-0 w-[270px]">
      <div className="flex items-center justify-between px-2 py-2 border-b-2" style={{ borderColor: col.color }}>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color }} />{col.label}</span>
        <Badge variant="secondary" className="text-[10px]">{tasks.length}</Badge>
      </div>
      <div ref={setNodeRef} className={cn('min-h-[300px] p-2 space-y-2 rounded-b-lg bg-slate-100/60 transition-colors', isOver && 'bg-purple-100 ring-2 ring-purple-300')}>
        {tasks.map((t) => <KanbanCard key={t.id} t={t} onOpen={() => onOpen(t)} editor={editor} />)}
        {tasks.length === 0 && <p className="text-xs text-slate-400 text-center py-6">—</p>}
      </div>
    </div>
  );
}

function DoneZone({ tasks, onOpen, collapsed, onToggle }: { tasks: PublicClientTask[]; onOpen: (t: PublicClientTask) => void; collapsed: boolean; onToggle: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'col-hechas' });
  return (
    <div ref={setNodeRef} className={cn('mt-4 bg-white rounded-xl border overflow-hidden transition-colors', isOver && 'ring-2 ring-emerald-300 bg-emerald-50')}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50">
        {collapsed ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <span className="font-semibold text-slate-700">Tareas hechas</span>
        <Badge variant="secondary" className="text-[10px] ml-1">{tasks.length}</Badge>
        <span className="text-[11px] text-slate-400 ml-auto">Arrastra aquí para aprobar</span>
      </button>
      {!collapsed && (
        <div className="border-t p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {tasks.map((t) => (
            <button key={t.id} onClick={() => onOpen(t)} className="text-left rounded-lg border bg-slate-50 px-3 py-2 hover:bg-slate-100">
              <div className="text-sm font-medium text-slate-700 line-through decoration-slate-300">{t.titulo}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5">{t.estado}</div>
            </button>
          ))}
          {tasks.length === 0 && <p className="text-xs text-slate-400 col-span-full text-center py-3">Aún no hay tareas terminadas.</p>}
        </div>
      )}
    </div>
  );
}

const SALUD_DOT: Record<string, string> = { verde: 'bg-emerald-500', amarillo: 'bg-amber-500', rojo: 'bg-rose-500' };
const ESTADO_PROY: Record<string, string> = { en_curso: 'En curso', pausado: 'Pausado', terminado: 'Terminado', cancelado: 'Cancelado' };

export default function ClientBoardPublic() {
  const { token = '' } = useParams();
  const [data, setData] = useState<{ titulo: string; marca: string; cliente_nombre: string | null; cliente_editor: boolean; departments: { id: string; nombre: string }[]; projects: PublicProject[]; tasks: PublicClientTask[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nombre, setNombre] = useState<string>('');
  const [askName, setAskName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'proyectos' | 'kanban' | 'lista' | 'departamentos'>('proyectos');
  const [doneCollapsed, setDoneCollapsed] = useState(true);
  const [listFilter, setListFilter] = useState('todos');
  const [newTask, setNewTask] = useState<{ open: boolean; dept: string | null }>({ open: false, dept: null });
  const [ntTitulo, setNtTitulo] = useState('');
  const [ntDetalle, setNtDetalle] = useState('');
  const [ntSending, setNtSending] = useState(false);
  const [selProject, setSelProject] = useState<PublicProject | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const NAME_KEY = `client_name_${token}`;

  const load = useCallback(async () => {
    try {
      const d = await api.getPublicClientBoard(token);
      setData(d);
      if (!d.projects || d.projects.length === 0) setView('kanban');
    } catch { setError(true); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) setNombre(saved); else setAskName(true);
    load();
  }, [load, NAME_KEY]);

  // Página pública: siempre en modo claro (el dark mode del visitante volvía invisible el texto)
  useEffect(() => {
    const hadDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    return () => { if (hadDark) document.documentElement.classList.add('dark'); };
  }, []);

  const saveName = () => { const n = nameInput.trim(); if (!n) return; localStorage.setItem(NAME_KEY, n); setNombre(n); setAskName(false); };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const taskId = e.active.id as string;
    const over = e.over; if (!over) return;
    const target = String(over.id).replace('col-', '');
    const task = data?.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const editor = !!data?.cliente_editor;
    let nuevo: 'aprobado' | 'en_proceso' | 'backlog' | 'revision_cliente' | null = null;
    if (editor) {
      // Tablero colaborativo: mover libre entre columnas (estilo Monday)
      if (task.estado_raw === 'entregado') return;
      const MAP: Record<string, typeof nuevo> = { pendiente: 'backlog', en_proceso: 'en_proceso', revision: 'revision_cliente', aprobado: 'aprobado', entregado: 'aprobado', hechas: 'aprobado' };
      nuevo = MAP[target] || null;
      if (!nuevo || nuevo === task.estado_raw) return;
    } else {
      if (task.estado_raw !== 'revision_cliente') return;
      if (target === 'aprobado' || target === 'hechas') nuevo = 'aprobado'; else if (target === 'en_proceso') nuevo = 'en_proceso'; else return;
    }
    try {
      await api.setPublicTaskStatus(token, taskId, nuevo, nombre || 'Cliente');
      toast.success(nuevo === 'aprobado' ? '¡Aprobado! El equipo fue notificado.' : nuevo === 'en_proceso' && task.estado_raw === 'revision_cliente' ? 'Pediste cambios. El equipo lo verá.' : 'Tarea movida.');
      load();
    }
    catch (er) { toast.error(er instanceof Error ? er.message : 'No se pudo'); }
  };

  // Detalle de tarea
  const [openTask, setOpenTask] = useState<PublicClientTask | null>(null);
  const [comments, setComments] = useState<{ id: string; autor_nombre: string; es_interno: boolean; comentario: string; created_at: string }[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const openDetail = async (t: PublicClientTask) => {
    setOpenTask(t); setComments([]); setLoadingComments(true);
    try { setComments(await api.getPublicTaskComments(token, t.id)); } catch { /* */ } finally { setLoadingComments(false); }
  };
  const sendComment = async (html: string) => { if (!openTask) return; const c = await api.postPublicComment(token, openTask.id, nombre || 'Cliente', html); setComments((p) => [...p, c]); };
  const actOnTask = async (estado: 'aprobado' | 'en_proceso') => {
    if (!openTask) return;
    try { await api.setPublicTaskStatus(token, openTask.id, estado, nombre || 'Cliente'); toast.success(estado === 'aprobado' ? '¡Aprobado!' : 'Pediste cambios.'); setOpenTask(null); load(); }
    catch (er) { toast.error(er instanceof Error ? er.message : 'No se pudo'); }
  };

  // Pedir requerimiento (editor rico)
  const [reqOpen, setReqOpen] = useState(false);
  const [reqTitulo, setReqTitulo] = useState('');
  const [reqDetalle, setReqDetalle] = useState('');
  const [reqResetKey, setReqResetKey] = useState(0);
  const [sendingReq, setSendingReq] = useState(false);
  const sendRequest = async () => {
    if (!reqTitulo.trim()) return;
    setSendingReq(true);
    try {
      await api.postPublicRequest(token, { titulo: reqTitulo.trim(), detalle: reqDetalle || undefined, autor_nombre: nombre || 'Cliente' });
      toast.success('Solicitud enviada. El equipo la revisará.');
      setReqOpen(false); setReqTitulo(''); setReqDetalle(''); setReqResetKey((k) => k + 1);
    } catch { toast.error('No se pudo enviar'); } finally { setSendingReq(false); }
  };

  const createTask = async () => {
    if (!ntTitulo.trim()) return;
    setNtSending(true);
    try {
      await api.postPublicTask(token, { titulo: ntTitulo.trim(), detalle: ntDetalle.trim() || undefined, department_id: newTask.dept || undefined, autor_nombre: nombre || 'Cliente' });
      toast.success('Tarea creada. El equipo la verá en su tablero.');
      setNewTask({ open: false, dept: null }); setNtTitulo(''); setNtDetalle('');
      load();
    } catch (er) { toast.error(er instanceof Error ? er.message : 'No se pudo crear'); } finally { setNtSending(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  if (error || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center px-6">
      <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
      <h1 className="text-xl font-bold text-slate-700">Tablero no disponible</h1>
      <p className="text-sm text-slate-500 mt-2">El enlace no es válido o fue desactivado. Escríbele a tu contacto en la agencia.</p>
    </div>
  );

  const visibleTasks = selProject ? data.tasks.filter((t) => t.project_id === selProject.id) : data.tasks;
  const byCol: Record<string, PublicClientTask[]> = {};
  for (const c of COLS) byCol[c.key] = [];
  for (const t of visibleTasks) (byCol[colOf(t.estado_raw)] ||= []).push(t);
  const activeTask = data.tasks.find((t) => t.id === activeId);
  const openProject = (p: PublicProject) => { setSelProject(p); setView('kanban'); };

  // Resumen para el header del cliente
  const totalEnt = data.projects.reduce((a, p) => a + p.total_tareas, 0);
  const listasEnt = data.projects.reduce((a, p) => a + p.tareas_listas, 0);
  const enMarchaTot = data.projects.reduce((a, p) => a + (p.en_marcha || 0), 0);
  const pendRevision = data.tasks.filter((t) => t.estado_raw === 'revision_cliente').length;
  const hoyMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const proxHito = data.projects
    .filter((p) => p.fecha_fin && new Date(p.fecha_fin.slice(0, 10) + 'T00:00:00').getTime() >= hoyMs)
    .sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)))[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800">{data.titulo || `Proyectos — ${data.marca}`}</h1>
            <p className="text-xs text-slate-500">{data.marca}{nombre && <> · Hola, {nombre}</>}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle de vista */}
            <div className="flex rounded-lg border overflow-hidden">
              {data.projects.length > 0 && <button onClick={() => { setView('proyectos'); setSelProject(null); }} className={cn('px-3 py-1.5 text-xs font-medium flex items-center gap-1.5', view === 'proyectos' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}><FolderKanban className="h-3.5 w-3.5" />Proyectos</button>}
              <button onClick={() => setView('kanban')} className={cn('px-3 py-1.5 text-xs font-medium flex items-center gap-1.5', view === 'kanban' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}><LayoutGrid className="h-3.5 w-3.5" />Tablero</button>
              {data.cliente_editor && <button onClick={() => setView('departamentos')} className={cn('px-3 py-1.5 text-xs font-medium flex items-center gap-1.5', view === 'departamentos' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}><GripVertical className="h-3.5 w-3.5" />Departamentos</button>}
              <button onClick={() => setView('lista')} className={cn('px-3 py-1.5 text-xs font-medium flex items-center gap-1.5', view === 'lista' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}><ListIcon className="h-3.5 w-3.5" />Lista</button>
            </div>
            <Button size="sm" onClick={() => setReqOpen(true)} className="shrink-0"><Plus className="h-4 w-4" />Pedir algo</Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 overflow-x-auto">
        {selProject && view !== 'proyectos' && (
          <div className="mb-4 flex items-center gap-3 bg-white rounded-lg border p-3">
            <button onClick={() => { setSelProject(null); setView('proyectos'); }} className="text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /></button>
            <span className={cn('inline-block h-2.5 w-2.5 rounded-full', SALUD_DOT[selProject.salud])} />
            <span className="font-semibold text-slate-800">{selProject.nombre}</span>
            <span className="text-xs text-slate-500 ml-auto">{selProject.avance}% · {selProject.tareas_listas}/{selProject.total_tareas} entregables</span>
          </div>
        )}
        {data.tasks.length === 0 ? (
          <div className="text-center py-20 text-slate-400"><CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-40" />Todavía no hay proyectos cargados.</div>
        ) : view === 'proyectos' ? (
          <>
          {pendRevision > 0 && (
            <button onClick={() => { setSelProject(null); setView('kanban'); }}
              className="w-full mb-4 flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-left hover:bg-purple-100 transition-colors">
              <span className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center shrink-0"><ThumbsUp className="h-4.5 w-4.5 text-purple-600" /></span>
              <span className="flex-1 text-sm text-purple-900"><strong>{pendRevision} entregable{pendRevision > 1 ? 's' : ''}</strong> espera{pendRevision > 1 ? 'n' : ''} tu aprobación.</span>
              <span className="text-sm font-semibold text-purple-700 shrink-0">Revisar ahora →</span>
            </button>
          )}
          {data.projects.length > 0 && (
            <div className="mb-4 bg-white rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
              <span className="text-slate-600"><strong className="text-slate-800">{listasEnt}</strong> de <strong className="text-slate-800">{totalEnt}</strong> entregables listos</span>
              {enMarchaTot > 0 && <span className="text-slate-600"><strong className="text-slate-800">{enMarchaTot}</strong> en proceso</span>}
              {proxHito && <span className="text-slate-600 flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" />Próximo hito: <strong className="text-slate-800">{proxHito.nombre}</strong> · {fmtCorta(proxHito.fecha_fin)}</span>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.projects.map((p) => (
              <button key={p.id} onClick={() => openProject(p)} className="text-left bg-white rounded-xl border p-4 space-y-3 hover:border-purple-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-slate-800 flex items-center gap-2"><span className={cn('inline-block h-2.5 w-2.5 rounded-full', SALUD_DOT[p.salud])} />{p.nombre}</div>
                  <Badge variant="outline" className="text-[10px] shrink-0 bg-white text-slate-600 border-slate-200">{ESTADO_PROY[p.estado] || p.estado}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden flex">
                    <div className="h-full" style={{ width: `${p.avance}%`, backgroundColor: p.salud === 'rojo' ? '#ef4444' : p.salud === 'amarillo' ? '#f59e0b' : '#10b981' }} />
                    {(p.en_marcha || 0) > 0 && p.total_tareas > 0 && <div className="h-full" style={{ width: `${Math.min(100 - p.avance, Math.round((p.en_marcha / p.total_tareas) * 100))}%`, backgroundColor: p.salud === 'rojo' ? '#ef4444' : p.salud === 'amarillo' ? '#f59e0b' : '#10b981', opacity: 0.25 }} />}
                  </div>
                  <span className="text-xs font-medium text-slate-500 w-9 text-right">{p.avance}%</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{p.tareas_listas}/{p.total_tareas} entregables{(p.en_marcha || 0) > 0 ? ` · ${p.en_marcha} en proceso` : ''}</span>
                  {p.fecha_fin && <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtCorta(p.fecha_fin)}</span>}
                </div>
                <div className="text-[11px] text-primary font-medium">Ver detalle →</div>
              </button>
            ))}
          </div>
          </>
        ) : view === 'kanban' ? (
          <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
            <div className="flex gap-3 pb-1" style={{ touchAction: 'pan-x' }}>
              {(data.cliente_editor ? COLS.filter((co) => !['aprobado', 'entregado'].includes(co.key)) : COLS).map((co) => <Column key={co.key} col={co} tasks={byCol[co.key]} onOpen={openDetail} editor={data.cliente_editor} />)}
            </div>
            {data.cliente_editor && <DoneZone tasks={[...byCol['aprobado'], ...byCol['entregado']]} onOpen={openDetail} collapsed={doneCollapsed} onToggle={() => setDoneCollapsed((v) => !v)} />}
            <DragOverlay>{activeTask ? <div className="bg-white rounded-lg border p-3 shadow-lg w-[250px]"><span className="font-medium text-sm">{activeTask.titulo}</span></div> : null}</DragOverlay>
          </DndContext>
        ) : view === 'departamentos' ? (
          /* ── Vista DEPARTAMENTOS (tablero colaborativo) ── */
          (() => {
            const grupos: Record<string, PublicClientTask[]> = {};
            for (const t of visibleTasks) { const k = t.departamento || 'Por clasificar'; (grupos[k] ||= []).push(t); }
            const colorOf = (raw: string) => COLS.find((co) => co.raws.includes(raw))?.color || '#64748b';
            const DEPT_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5', '#0d9488', '#65a30d'];
            // Columnas: todos los departamentos (con o sin tareas) + "Por clasificar" si aplica
            const cols: { nombre: string; id: string | null; color: string }[] = data.departments.map((d, i) => ({ nombre: d.nombre, id: d.id, color: DEPT_COLORS[i % DEPT_COLORS.length] }));
            if (grupos['Por clasificar']) cols.unshift({ nombre: 'Por clasificar', id: null, color: '#94a3b8' });
            return (
              <div className="flex gap-3 pb-4 overflow-x-auto" style={{ touchAction: 'pan-x' }}>
                {cols.map((dep) => {
                  const tareas = grupos[dep.nombre] || [];
                  return (
                    <div key={dep.nombre} className="flex-shrink-0 w-[260px]">
                      <div className="flex items-center justify-between px-2 py-2 border-b-2" style={{ borderColor: dep.color }}>
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dep.color }} />{dep.nombre}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px]">{tareas.length}</Badge>
                          {dep.id && <button onClick={() => setNewTask({ open: true, dept: dep.id })} title={`Nueva tarea en ${dep.nombre}`} className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200"><Plus className="h-3.5 w-3.5" /></button>}
                        </div>
                      </div>
                      <div className="min-h-[260px] p-2 space-y-2 rounded-b-lg bg-slate-100/60">
                        {tareas.map((t) => (
                          <button key={t.id} onClick={() => openDetail(t)} className="w-full text-left bg-white rounded-lg border p-3 space-y-1.5 shadow-sm hover:border-slate-300">
                            <div className="font-medium text-sm text-slate-800">{t.titulo}</div>
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium" style={{ color: colorOf(t.estado_raw) }}><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(t.estado_raw) }} />{t.estado}</span>
                              {t.fecha_cliente && <span className="text-[10px] text-slate-400">{fmtCorta(t.fecha_cliente)}</span>}
                            </div>
                          </button>
                        ))}
                        {dep.id ? (
                          <button onClick={() => setNewTask({ open: true, dept: dep.id })} className={cn('w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 hover:text-slate-600 hover:border-slate-400 hover:bg-white transition-colors', tareas.length === 0 ? 'py-8' : 'py-2.5')}>
                            <Plus className="h-3.5 w-3.5" />{tareas.length === 0 ? 'Crea la primera tarea' : 'Nueva tarea'}
                          </button>
                        ) : (
                          tareas.length === 0 && <p className="text-xs text-slate-400 text-center py-6">—</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ) : (
          /* ── Vista LISTA agrupada por proyecto (como la interna) ── */
          (() => {
            const colorOf = (raw: string) => COLS.find((co) => co.raws.includes(raw))?.color || '#64748b';
            const filtered = listFilter === 'todos' ? visibleTasks : visibleTasks.filter((t) => colOf(t.estado_raw) === listFilter);
            const byProj: Record<string, PublicClientTask[]> = {};
            for (const t of filtered) { const k = t.project_id || 'sin'; (byProj[k] ||= []).push(t); }
            const DONE = ['aprobado', 'entregado'];
            const rank = (t: PublicClientTask) => (DONE.includes(t.estado_raw) ? 2 : 0) + (t.fecha_cliente ? 0 : 1);
            for (const k of Object.keys(byProj)) byProj[k].sort((a, b) => rank(a) - rank(b) || String(a.fecha_cliente || '9999').localeCompare(String(b.fecha_cliente || '9999')));
            const projGroups = [
              ...data.projects.filter((pr) => byProj[pr.id]).map((pr) => ({ id: pr.id, nombre: pr.nombre, tasks: byProj[pr.id] })),
              ...(byProj['sin'] ? [{ id: 'sin', nombre: 'Sin proyecto', tasks: byProj['sin'] }] : []),
            ];
            const chips = [{ key: 'todos', label: 'Todos', n: visibleTasks.length }, ...COLS.map((co) => ({ key: co.key, label: co.label, n: byCol[co.key].length })).filter((ch) => ch.n > 0)];
            const showResp = !!data.cliente_editor;
            return (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {chips.map((ch) => {
                    const dotColor = ch.key === 'todos' ? '#64748b' : (COLS.find((co) => co.key === ch.key)?.color || '#64748b');
                    return (
                      <button key={ch.key} onClick={() => setListFilter(ch.key)} className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors', listFilter === ch.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 hover:bg-slate-100')}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
                        {ch.label} ({ch.n})
                      </button>
                    );
                  })}
                </div>
                {projGroups.map((g) => {
                  const isCol = collapsed[g.id];
                  return (
                    <div key={g.id} className="bg-white rounded-xl border overflow-hidden">
                      <button onClick={() => setCollapsed((pp) => ({ ...pp, [g.id]: !pp[g.id] }))} className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50">
                        {isCol ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        <FolderKanban className="h-4 w-4 text-slate-400" />
                        <span className="font-semibold text-slate-700">{g.nombre}</span>
                        <Badge variant="secondary" className="text-[10px] ml-1">{g.tasks.length}</Badge>
                        {(() => {
                          const pr = data.projects.find((px) => px.id === g.id);
                          if (!pr) return null;
                          const barColor = pr.salud === 'rojo' ? '#ef4444' : pr.salud === 'amarillo' ? '#f59e0b' : '#10b981';
                          return (
                            <span className="ml-auto hidden sm:flex items-center gap-2">
                              <span className="text-[11px] text-slate-500">{pr.tareas_listas}/{pr.total_tareas} listas</span>
                              <span className="flex h-1.5 w-24 rounded-full overflow-hidden bg-slate-100">
                                <span className="h-full" style={{ width: `${pr.avance}%`, backgroundColor: barColor }} />
                                {(pr.en_marcha || 0) > 0 && pr.total_tareas > 0 && <span className="h-full" style={{ width: `${Math.min(100 - pr.avance, Math.round((pr.en_marcha / pr.total_tareas) * 100))}%`, backgroundColor: barColor, opacity: 0.25 }} />}
                              </span>
                              <span className="text-[11px] font-medium text-slate-600 w-8 text-right">{pr.avance}%</span>
                            </span>
                          );
                        })()}
                      </button>
                      {!isCol && (
                        <div className="overflow-x-auto">
                        <table className="w-full text-sm border-t min-w-[760px]">
                          <thead className="bg-slate-50 text-slate-400 text-[11px] uppercase">
                            <tr>
                              <th className="text-left font-medium px-4 py-2">Tarea</th>
                              <th className="text-left font-medium px-4 py-2 w-32">Estado</th>
                              {showResp && <th className="text-left font-medium px-4 py-2 w-36">Responsable</th>}
                              <th className="text-left font-medium px-4 py-2 w-28">Fecha creada</th>
                              <th className="text-left font-medium px-4 py-2 w-24">Entrega</th>
                              <th className="text-left font-medium px-4 py-2 w-32">Tiempo</th>
                              <th className="text-left font-medium px-4 py-2 w-20">Entregable</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {g.tasks.map((t) => {
                              const d = diasInfo(t.fecha_cliente, t.estado_raw);
                              return (
                                <tr key={t.id} className={cn('hover:bg-slate-50 cursor-pointer', DONE.includes(t.estado_raw) && 'opacity-60')} onClick={() => openDetail(t)}>
                                  <td className={cn('px-4 py-2.5 font-medium text-slate-800', DONE.includes(t.estado_raw) && 'line-through decoration-slate-300')}>{t.titulo}</td>
                                  <td className="px-4 py-2.5"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap" style={{ backgroundColor: colorOf(t.estado_raw) }}>{t.estado}</span></td>
                                  {showResp && (
                                    <td className="px-4 py-2.5">
                                      {t.responsable ? (
                                        <span className="flex items-center gap-1.5">
                                          <span className="h-6 w-6 rounded-full bg-slate-200 text-slate-600 text-[9px] font-bold flex items-center justify-center shrink-0">
                                            {t.responsable.split(',')[0].trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                                          </span>
                                          <span className="text-xs text-slate-600 truncate max-w-[110px]" title={t.responsable}>{t.responsable}</span>
                                        </span>
                                      ) : <span className="text-slate-300 text-xs">—</span>}
                                    </td>
                                  )}
                                  <td className="px-4 py-2.5 text-slate-500">{fmtCorta(t.creada)}</td>
                                  <td className="px-4 py-2.5 text-slate-600">{fmtCorta(t.fecha_cliente)}</td>
                                  <td className="px-4 py-2.5"><span className={cn('text-xs', d?.cls || 'text-slate-400')}>{d?.txt || '—'}</span></td>
                                  <td className="px-4 py-2.5">{t.links.length > 0 ? <a href={t.links[0]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline text-xs"><ExternalLink className="h-3.5 w-3.5" />Ver</a> : <span className="text-slate-300 text-xs">—</span>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      )}
                    </div>
                  );
                })}
                {projGroups.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No hay tareas con este filtro.</p>}
              </div>
            );
          })()
        )}
      </main>

      {/* Detalle de tarea con comentarios ricos */}
      <Dialog open={!!openTask} onOpenChange={(o) => { if (!o) setOpenTask(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{openTask?.titulo}</DialogTitle>
            <DialogDescription className="flex items-center gap-2 flex-wrap text-xs">
              {openTask && <Badge variant="outline" className="text-[10px]">{openTask.estado}</Badge>}
              {openTask && <span>Creada: {fmtCorta(openTask.creada)}</span>}
              {openTask?.fecha_cliente && <span>· Entrega: {fmtFecha(openTask.fecha_cliente)}</span>}
              {openTask && (() => { const d = diasInfo(openTask.fecha_cliente, openTask.estado_raw); return d ? <span className={d.cls}>· {d.txt}</span> : null; })()}
            </DialogDescription>
          </DialogHeader>
          {openTask?.estado_raw === 'revision_cliente' && (
            <div className="flex gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => actOnTask('aprobado')}><ThumbsUp className="h-4 w-4" />Aprobar</Button>
              <Button size="sm" variant="outline" onClick={() => actOnTask('en_proceso')}><RotateCcw className="h-4 w-4" />Pedir cambios</Button>
            </div>
          )}
          {openTask?.detalle && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 max-h-48 overflow-y-auto">
              <p className="text-xs font-medium text-slate-500 mb-1">Detalle</p>
              <div className="text-sm text-slate-700"><RichTextViewer content={openTask.detalle} /></div>
            </div>
          )}
          {openTask && openTask.links.length > 0 && (
            <div className="space-y-1"><p className="text-xs font-medium text-slate-500">Entregables</p>{openTask.links.map((l, i) => <a key={i} href={l} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline break-all"><ExternalLink className="h-3.5 w-3.5 shrink-0" />{l}</a>)}</div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Comentarios</p>
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {loadingComments ? <Loader2 className="h-4 w-4 animate-spin text-slate-400 mx-auto my-4" />
                : comments.length === 0 ? <p className="text-xs text-slate-400 py-3 text-center">Sin comentarios todavía.</p>
                : comments.map((c) => (
                  <div key={c.id} className={cn('rounded-lg px-3 py-2', c.es_interno ? 'bg-blue-50' : 'bg-slate-100')}>
                    <div className="text-[11px] text-slate-500 mb-0.5">{c.es_interno ? '🏢 ' : '👤 '}{c.autor_nombre}</div>
                    <div className="text-sm"><RichTextViewer content={c.comentario} /></div>
                  </div>
                ))}
            </div>
            {openTask && <ClientCommentBox theme="light" placeholder="Escribe un comentario…" onSubmit={sendComment} uploadImage={(f) => api.uploadPublicClientImage(token, f)} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Pedir requerimiento — profesional, con editor rico */}
      <Dialog open={newTask.open} onOpenChange={(o) => setNewTask((p) => ({ ...p, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva tarea{newTask.dept ? ` · ${data.departments.find((d) => d.id === newTask.dept)?.nombre || ''}` : ''}</DialogTitle>
            <DialogDescription>Se creará en el tablero del equipo como pendiente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Título de la tarea" value={ntTitulo} onChange={(e) => setNtTitulo(e.target.value)} maxLength={480} />
            <textarea className="w-full rounded-md border bg-white px-3 py-2 text-sm min-h-[90px]" placeholder="Detalle (opcional)" value={ntDetalle} onChange={(e) => setNtDetalle(e.target.value)} maxLength={4000} />
            <select className="w-full rounded-md border bg-white px-3 py-2 text-sm" value={newTask.dept || ''} onChange={(e) => setNewTask((p) => ({ ...p, dept: e.target.value || null }))}>
              <option value="">Sin departamento</option>
              {data.departments.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTask({ open: false, dept: null })}>Cancelar</Button>
            <Button onClick={createTask} disabled={ntSending || !ntTitulo.trim()}>{ntSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Crear tarea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Plus className="h-4 w-4 text-primary" /></span>Pedir algo al equipo</DialogTitle>
            <DialogDescription>Cuéntanos qué necesitas con el mayor detalle posible. Puedes adjuntar imágenes de referencia. El equipo lo revisa y lo agrega a tus proyectos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><label className="text-xs font-medium text-slate-600">¿Qué necesitas? *</label><Input value={reqTitulo} onChange={(e) => setReqTitulo(e.target.value)} placeholder="Ej. Banner para la página web" maxLength={200} /></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-slate-600">Detalles y referencias</label>
              <RichEditorField theme="light" placeholder="Describe lo que necesitas: medidas, textos, estilo, fecha deseada… y pega imágenes de referencia." minHeight="140px" resetKey={reqResetKey} onChange={setReqDetalle} uploadImage={(f) => api.uploadPublicClientImage(token, f)} />
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setReqOpen(false)}>Cancelar</Button><Button onClick={sendRequest} disabled={sendingReq || !reqTitulo.trim()}>{sendingReq ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar solicitud</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nombre 1ª visita */}
      <Dialog open={askName} onOpenChange={() => { /* */ }}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>¡Bienvenido!</DialogTitle><DialogDescription>Para empezar, dinos tu nombre. Lo usaremos para firmar tus comentarios.</DialogDescription></DialogHeader>
          <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Tu nombre (ej. Antonio)" onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} autoFocus />
          <DialogFooter><Button onClick={saveName} disabled={!nameInput.trim()} className="w-full">Entrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="text-center py-4 text-xs text-slate-400">Tablero de seguimiento · Qbit</footer>
    </div>
  );
}
