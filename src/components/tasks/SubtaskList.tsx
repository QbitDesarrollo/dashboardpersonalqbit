import { useEffect, useState, useRef, KeyboardEvent } from 'react';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Loader2, GripVertical, Trash2, Pencil, Check, X, ExternalLink, UserPlus, Search, Calendar as CalendarIcon, AlertCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RescheduleDialog, MotivoReschedule } from './RescheduleDialog';

interface Responsable {
  user_id: string;
  nombre: string;
  avatar_url: string | null;
}

interface Subtask {
  id: string;
  titulo_tarea: string;
  estado: string;
  check_done: number | boolean;
  prioridad: string;
  responsables?: Responsable[];
  responsable_user_id?: string | null;
  desk_id?: string | null;
  fecha_entrega?: string | null;
  fecha_inicio?: string | null;
}

// Helpers de fecha
function parseLocalDate(s: string): Date {
  // Acepta YYYY-MM-DD o ISO. Devuelve Date local (sin shift de zona)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(s);
}
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function getDateBadgeColor(fecha: string | null | undefined, isDone: boolean): string {
  if (!fecha) return 'bg-muted/40 text-muted-foreground border-muted';
  if (isDone) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  const d = parseLocalDate(fecha); d.setHours(23, 59, 59, 999);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = (d.getTime() - today.getTime()) / 86_400_000;
  if (diff < 0) return 'bg-red-100 text-red-700 border-red-200'; // vencida
  if (diff < 1) return 'bg-orange-100 text-orange-700 border-orange-200'; // hoy
  if (diff < 3) return 'bg-amber-100 text-amber-700 border-amber-200'; // 1-2 días
  return 'bg-gray-100 text-gray-700 border-gray-200';
}
function formatDateShort(s: string | null | undefined): string {
  if (!s) return '+ Fecha';
  const d = parseLocalDate(s);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (diffDays < 0) return `Hace ${Math.abs(diffDays)}d`;
  if (diffDays < 7) return d.toLocaleDateString('es-ES', { weekday: 'short' });
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

interface ProfileLite {
  id: string;
  nombre: string;
  email?: string;
  avatar_url?: string | null;
}

const ESTADOS = ['backlog', 'en_proceso', 'revision_interna', 'revision_cliente', 'entregado', 'bloqueado'] as const;
const PRIORIDADES = ['alta', 'media', 'baja'] as const;

const estadoColors: Record<string, string> = {
  backlog: 'bg-gray-100 text-gray-700 border-gray-200',
  en_proceso: 'bg-blue-100 text-blue-700 border-blue-200',
  en_revision: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  revision_interna: 'bg-amber-100 text-amber-700 border-amber-200',
  revision_cliente: 'bg-purple-100 text-purple-700 border-purple-200',
  aprobado: 'bg-green-100 text-green-700 border-green-200',
  entregado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  bloqueado: 'bg-red-100 text-red-700 border-red-200',
};

const estadoLabels: Record<string, string> = {
  backlog: 'Pendiente',
  en_proceso: 'En proceso',
  en_revision: 'En revisión',
  revision_interna: 'Revisión interna',
  revision_cliente: 'Revisión cliente',
  aprobado: 'Aprobado',
  entregado: 'Entregado',
  bloqueado: 'Bloqueado',
};

const prioridadColors: Record<string, string> = {
  alta: 'bg-red-100 text-red-700 border-red-200',
  media: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  baja: 'bg-gray-100 text-gray-600 border-gray-200',
};

// ─────────────────── Sortable subtask card ───────────────────
function SortableRow({
  st,
  members,
  onToggle,
  onSave,
  onDelete,
  onChangeEstado,
  onChangePrioridad,
  onChangeResponsables,
  onChangeFecha,
  onOpenFull,
}: {
  st: Subtask;
  members: ProfileLite[];
  onToggle: () => void;
  onSave: (newTitle: string) => Promise<void>;
  onDelete: () => void;
  onChangeEstado: (estado: string) => void;
  onChangePrioridad: (prioridad: string) => void;
  onChangeResponsables: (userIds: string[]) => Promise<void>;
  onChangeFecha: (fecha: string | null) => void;
  onOpenFull: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: st.id });
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(st.titulo_tarea);
  const [saving, setSaving] = useState(false);
  const [respOpen, setRespOpen] = useState(false);
  const [respSearch, setRespSearch] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [deadlineHistory, setDeadlineHistory] = useState<{ count: number; history: Array<{ old: string | null; new: string | null; motivo: string; comentario: string | null; by: string; at: string }> }>({ count: 0, history: [] });
  const [historyOpen, setHistoryOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    api.getDeadlineHistory(st.id)
      .then((h) => {
        if (!cancelled) setDeadlineHistory({ count: h.reschedule_count, history: h.history || [] });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [st.id, st.fecha_entrega]);
  const reschedules = deadlineHistory.count;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const responsables = st.responsables || [];
  const responsableIds = new Set(responsables.map(r => r.user_id));
  const filteredMembers = respSearch
    ? members.filter(m => m.nombre.toLowerCase().includes(respSearch.toLowerCase()) || (m.email || '').toLowerCase().includes(respSearch.toLowerCase()))
    : members;

  const commitEdit = async () => {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === st.titulo_tarea) {
      setEditing(false);
      setDraftTitle(st.titulo_tarea);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      toast.error('Error al guardar');
    }
    setSaving(false);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') { setEditing(false); setDraftTitle(st.titulo_tarea); }
  };

  const toggleResp = async (uid: string) => {
    const next = new Set(responsableIds);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    await onChangeResponsables(Array.from(next));
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-start gap-2 p-2.5 rounded-lg border bg-card transition-colors hover:border-primary/30",
        st.check_done && "opacity-60"
      )}
    >
      {/* Drag handle siempre visible */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none mt-1.5"
        aria-label="Reordenar"
        title="Arrastrar para reordenar"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <Checkbox checked={!!st.check_done} onCheckedChange={onToggle} onPointerDown={(e) => e.stopPropagation()} className="mt-1.5" />

      {/* Contenido principal */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Título + acciones derecha */}
        <div className="flex items-start gap-2">
          {editing ? (
            <div className="flex-1 flex items-center gap-1">
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={handleKey}
                onBlur={commitEdit}
                autoFocus
                className="h-7 text-sm"
                disabled={saving}
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={commitEdit} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenFull}
              className={cn(
                "text-sm flex-1 text-left hover:text-primary transition-colors",
                st.check_done && "line-through text-muted-foreground"
              )}
              title="Click para abrir tarea completa"
            >
              {st.titulo_tarea}
            </button>
          )}

          <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity shrink-0">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)} title="Editar título">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onOpenFull} title="Abrir tarea completa">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50" onClick={onDelete} title="Eliminar subtarea">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Línea de meta: prioridad / estado / responsables */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={st.prioridad} onValueChange={onChangePrioridad}>
            <SelectTrigger
              onPointerDown={(e) => e.stopPropagation()}
              className={cn("h-6 w-auto px-2 text-[11px] font-medium border", prioridadColors[st.prioridad] || '')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORIDADES.map((p) => (
                <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={st.estado} onValueChange={onChangeEstado}>
            <SelectTrigger
              onPointerDown={(e) => e.stopPropagation()}
              className={cn("h-6 w-auto px-2 text-[11px] font-medium border", estadoColors[st.estado] || '')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS.map((e) => (
                <SelectItem key={e} value={e} className="text-xs">{estadoLabels[e]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Fecha de entrega: button con showPicker() + popover de historial */}
          <div className="relative inline-flex items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const inp = dateInputRef.current;
                if (!inp) return;
                if (typeof (inp as any).showPicker === 'function') {
                  try { (inp as any).showPicker(); } catch { inp.focus(); inp.click(); }
                } else { inp.focus(); inp.click(); }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center gap-1 h-6 px-2 rounded border text-[11px] font-medium transition-colors hover:opacity-80 cursor-pointer",
                getDateBadgeColor(st.fecha_entrega, !!st.check_done)
              )}
              title={st.fecha_entrega ? `Entrega: ${parseLocalDate(st.fecha_entrega).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Click para asignar fecha'}
            >
              <CalendarIcon className="w-3 h-3" />
              <span>{formatDateShort(st.fecha_entrega)}</span>
            </button>

            {reschedules > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setHistoryOpen(v => !v); }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className={cn(
                  "ml-1 px-1.5 h-5 rounded-full text-[10px] font-bold cursor-pointer hover:opacity-80",
                  reschedules >= 3 ? 'bg-red-500 text-white' :
                  reschedules >= 2 ? 'bg-amber-500 text-white' :
                  'bg-blue-500 text-white'
                )}
                title={`Reagendada ${reschedules} ${reschedules === 1 ? 'vez' : 'veces'} · Click para ver historial`}
              >
                {reschedules}×
              </button>
            )}

            {st.fecha_entrega && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChangeFecha(null); }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="ml-0.5 h-5 w-5 flex items-center justify-center text-[10px] text-muted-foreground hover:text-red-600 rounded"
                title="Quitar fecha"
              >
                ×
              </button>
            )}

            {/* Input oculto que dispara showPicker desde el button */}
            <input
              ref={dateInputRef}
              type="date"
              value={st.fecha_entrega ? st.fecha_entrega.slice(0, 10) : ''}
              onChange={(e) => onChangeFecha(e.target.value || null)}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />

            {/* Popover historial de cambios de fecha */}
            {historyOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setHistoryOpen(false)} />
                <div
                  className="absolute z-50 top-full mt-1 left-0 bg-popover border rounded-lg shadow-lg p-3 w-[300px]"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Historial · {reschedules} {reschedules === 1 ? 'cambio' : 'cambios'}
                    </p>
                    <button onClick={() => setHistoryOpen(false)} className="text-muted-foreground hover:text-foreground text-base leading-none">×</button>
                  </div>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                    {deadlineHistory.history.map((h, i) => {
                      const motivoMeta: Record<string, { label: string; cls: string }> = {
                        INTERNO: { label: 'Interno', cls: 'bg-red-100 text-red-700' },
                        CLIENTE: { label: 'Cliente', cls: 'bg-blue-100 text-blue-700' },
                        ALCANCE: { label: 'Alcance', cls: 'bg-amber-100 text-amber-700' },
                        FUERZA_MAYOR: { label: 'Fuerza mayor', cls: 'bg-gray-100 text-gray-700' },
                        SIN_CLASIFICAR: { label: 'Sin clasificar', cls: 'bg-gray-100 text-gray-500' },
                      };
                      const mm = motivoMeta[h.motivo] || motivoMeta.SIN_CLASIFICAR;
                      return (
                        <div key={i} className="text-[11px] flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
                          <span className="text-muted-foreground shrink-0 w-14">
                            {new Date(h.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {h.old && <span className="line-through text-muted-foreground">{new Date(h.old).toLocaleDateString('es-ES')}</span>}
                              <span className="text-muted-foreground">→</span>
                              <span className="font-semibold">{h.new ? new Date(h.new).toLocaleDateString('es-ES') : 'Sin fecha'}</span>
                              <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-medium', mm.cls)}>{mm.label}</span>
                            </div>
                            <span className="text-muted-foreground text-[10px]">por {h.by}</span>
                            {h.comentario && <span className="block text-muted-foreground text-[10px] italic">"{h.comentario}"</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Responsables */}
          <Popover open={respOpen} onOpenChange={(v) => { setRespOpen(v); if (!v) setRespSearch(''); }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1 h-6 px-1.5 rounded border border-dashed border-muted-foreground/40 hover:border-primary/50 hover:bg-muted/40 transition-colors"
                title="Asignar responsables"
              >
                {responsables.length === 0 ? (
                  <>
                    <UserPlus className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Asignar</span>
                  </>
                ) : (
                  <div className="flex -space-x-1.5">
                    {responsables.slice(0, 3).map((r) => (
                      <Avatar key={r.user_id} className="h-5 w-5 border border-background">
                        {r.avatar_url && <AvatarImage src={r.avatar_url} alt={r.nombre} />}
                        <AvatarFallback className="text-[9px]">{getInitials(r.nombre)}</AvatarFallback>
                      </Avatar>
                    ))}
                    {responsables.length > 3 && (
                      <span className="h-5 w-5 rounded-full bg-muted text-[9px] flex items-center justify-center border border-background">
                        +{responsables.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-0"
              align="start"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={respSearch}
                    onChange={(e) => setRespSearch(e.target.value)}
                    className="pl-7 h-7 text-xs"
                  />
                </div>
              </div>
              <ScrollArea className="max-h-[240px]">
                <div className="p-1">
                  {filteredMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">Sin resultados</p>
                  ) : (
                    filteredMembers.map((m) => {
                      const checked = responsableIds.has(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleResp(m.id)}
                          className={cn(
                            "w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left",
                            checked && "bg-primary/10"
                          )}
                        >
                          <div className="w-4 h-4 flex items-center justify-center">
                            {checked && <Check className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          <Avatar className="h-6 w-6">
                            {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.nombre} />}
                            <AvatarFallback className="text-[10px]">{getInitials(m.nombre)}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs flex-1 truncate">{m.nombre}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Lista principal ───────────────────
export function SubtaskList({
  taskId,
  deskId,
  onUpdate,
  onOpenSubtask,
}: {
  taskId: string;
  deskId?: string;
  onUpdate?: () => void;
  /** Callback que abre el TaskDetailDialog para la subtarea */
  onOpenSubtask?: (subtaskId: string) => void;
}) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newFecha, setNewFecha] = useState<string | null>(null);
  const [newDateOpen, setNewDateOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [members, setMembers] = useState<ProfileLite[]>([]);
  const [pendingReschedule, setPendingReschedule] = useState<{ subtaskId: string; oldDate: string | null; newDate: string | null } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchSubtasks = async () => {
    try {
      const data = await api.getSubtasks(taskId);
      setSubtasks(data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  // Cargar miembros disponibles para asignar (de la mesa de la tarea padre, si existe; si no, todos)
  const fetchMembers = async () => {
    try {
      const data = deskId ? await api.getProfiles(deskId) : await api.getProfiles();
      if (Array.isArray(data)) setMembers(data as ProfileLite[]);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchSubtasks(); }, [taskId]);
  useEffect(() => { fetchMembers(); }, [deskId]);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const payload: { titulo_tarea: string; fecha_entrega?: string } = { titulo_tarea: newTitle.trim() };
      if (newFecha) payload.fecha_entrega = newFecha;
      await api.createSubtask(taskId, payload);
      setNewTitle('');
      setNewFecha(null);
      await fetchSubtasks();
      onUpdate?.();
      toast.success('Subtarea creada');
    } catch {
      toast.error('Error al crear subtarea');
    }
    setAdding(false);
  };

  const toggleDone = async (st: Subtask) => {
    const newDone = !st.check_done;
    setSubtasks((prev) => prev.map((s) => (s.id === st.id ? { ...s, check_done: newDone, estado: newDone ? 'entregado' : 'en_proceso' } : s)));
    try {
      await api.patchTask(st.id, { check_done: newDone, estado: newDone ? 'entregado' : 'en_proceso' });
      onUpdate?.();
    } catch {
      toast.error('Error al actualizar');
      fetchSubtasks();
    }
  };

  const saveTitle = async (st: Subtask, t: string) => {
    setSubtasks((prev) => prev.map((s) => s.id === st.id ? { ...s, titulo_tarea: t } : s));
    await api.patchTask(st.id, { titulo_tarea: t });
    onUpdate?.();
    toast.success('Título actualizado');
  };

  const changeEstado = async (st: Subtask, estado: string) => {
    setSubtasks((prev) => prev.map((s) => s.id === st.id ? { ...s, estado, check_done: estado === 'entregado' || estado === 'aprobado' ? 1 : 0 } : s));
    try {
      await api.patchTask(st.id, { estado, check_done: estado === 'entregado' || estado === 'aprobado' });
      onUpdate?.();
    } catch { toast.error('Error al cambiar estado'); fetchSubtasks(); }
  };

  const changePrioridad = async (st: Subtask, prioridad: string) => {
    setSubtasks((prev) => prev.map((s) => s.id === st.id ? { ...s, prioridad } : s));
    try { await api.patchTask(st.id, { prioridad }); onUpdate?.(); }
    catch { toast.error('Error al cambiar prioridad'); fetchSubtasks(); }
  };

  // Aplica el cambio de fecha al backend. Si hay motivo, lo pasa para registrar el reschedule.
  const applyFechaChange = async (subtaskId: string, fecha: string | null, motivo: string | null, comentario: string | null) => {
    setSubtasks((prev) => prev.map((s) => s.id === subtaskId ? { ...s, fecha_entrega: fecha } : s));
    try {
      const body: Record<string, unknown> = { fecha_entrega: fecha };
      if (motivo) { body.motivo_reschedule = motivo; body.comentario_reschedule = comentario || ''; }
      await api.patchTask(subtaskId, body);
      onUpdate?.();
      toast.success(fecha ? 'Fecha actualizada' : 'Fecha removida');
    } catch {
      toast.error('Error al cambiar fecha');
      fetchSubtasks();
    }
  };

  const changeFecha = (st: Subtask, fecha: string | null) => {
    const oldFecha = st.fecha_entrega ? st.fecha_entrega.slice(0, 10) : null;
    // Primera asignación (no había fecha) o quitar fecha → directo, sin pedir motivo
    if (!oldFecha || !fecha) {
      applyFechaChange(st.id, fecha, null, null);
      return;
    }
    // Cambio real de una fecha a otra → pedir motivo
    setPendingReschedule({ subtaskId: st.id, oldDate: oldFecha, newDate: fecha });
  };

  const changeResponsables = async (st: Subtask, userIds: string[]) => {
    // Optimistic
    const newResp = userIds.map((uid) => {
      const m = members.find((x) => x.id === uid);
      return { user_id: uid, nombre: m?.nombre || 'Usuario', avatar_url: m?.avatar_url || null };
    });
    setSubtasks((prev) => prev.map((s) => s.id === st.id ? { ...s, responsables: newResp } : s));
    try {
      await api.patchTask(st.id, { responsable_ids: userIds });
      onUpdate?.();
    } catch {
      toast.error('Error al asignar responsables');
      fetchSubtasks();
    }
  };

  const handleDelete = async (st: Subtask) => {
    if (!confirm(`¿Eliminar la subtarea "${st.titulo_tarea}"?`)) return;
    const prev = subtasks;
    setSubtasks((cur) => cur.filter((s) => s.id !== st.id));
    try {
      await api.deleteSubtask(taskId, st.id);
      onUpdate?.();
      toast.success('Subtarea eliminada');
    } catch {
      toast.error('Error al eliminar');
      setSubtasks(prev);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(subtasks, oldIndex, newIndex);
    setSubtasks(reordered);
    try {
      await api.reorderSubtasks(taskId, reordered.map((s) => s.id));
    } catch {
      toast.error('Error al reordenar');
      fetchSubtasks();
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground py-2">Cargando subtareas...</div>;

  const completed = subtasks.filter((s) => !!s.check_done).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Subtareas ({completed}/{subtasks.length})
        </span>
        {subtasks.length > 0 && (
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${subtasks.length > 0 ? (completed / subtasks.length) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {subtasks.map((st) => (
              <SortableRow
                key={st.id}
                st={st}
                members={members}
                onToggle={() => toggleDone(st)}
                onSave={(t) => saveTitle(st, t)}
                onDelete={() => handleDelete(st)}
                onChangeEstado={(e) => changeEstado(st, e)}
                onChangePrioridad={(p) => changePrioridad(st, p)}
                onChangeResponsables={(uids) => changeResponsables(st, uids)}
                onChangeFecha={(f) => changeFecha(st, f)}
                onOpenFull={() => onOpenSubtask?.(st.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {subtasks.length > 0 && (
        <p className="text-[10px] text-muted-foreground italic px-1">
          💡 Click en el título o ícono ↗ para abrir la subtarea completa · arrastra ⋮⋮ para reordenar
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Input
          placeholder="Nueva subtarea..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="h-8 text-sm flex-1"
        />
        <Popover open={newDateOpen} onOpenChange={setNewDateOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className={cn("h-8 px-2 gap-1", newFecha && "border-primary text-primary")}
              title={newFecha ? `Fecha: ${parseLocalDate(newFecha).toLocaleDateString('es-ES')}` : 'Asignar fecha (opcional)'}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              {newFecha && (
                <span className="text-[11px]">{formatDateShort(newFecha)}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={newFecha ? parseLocalDate(newFecha) : undefined}
              onDayClick={(d) => {
                if (d) {
                  setNewFecha(formatLocalDate(d));
                  setNewDateOpen(false);
                }
              }}
              onSelect={(d) => {
                if (d) {
                  setNewFecha(formatLocalDate(d));
                  setNewDateOpen(false);
                }
              }}
              initialFocus
            />
            {newFecha && (
              <div className="p-2 border-t">
                <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-red-600" onClick={() => { setNewFecha(null); setNewDateOpen(false); }}>
                  Quitar fecha
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="outline" onClick={handleAdd} disabled={adding || !newTitle.trim()}>
          {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
        </Button>
      </div>

      {/* Dialog de motivo de reagendamiento */}
      <RescheduleDialog
        open={!!pendingReschedule}
        fechaAnterior={pendingReschedule?.oldDate ?? null}
        fechaNueva={pendingReschedule?.newDate ?? null}
        onConfirm={(motivo: MotivoReschedule, comentario: string) => {
          if (pendingReschedule) {
            applyFechaChange(pendingReschedule.subtaskId, pendingReschedule.newDate, motivo, comentario);
          }
          setPendingReschedule(null);
        }}
        onCancel={() => {
          setPendingReschedule(null);
          fetchSubtasks(); // revertir el optimistic visual del input
        }}
      />
    </div>
  );
}
