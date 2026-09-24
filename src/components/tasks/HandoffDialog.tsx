import { useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDepartments, DepartmentBadge } from '@/components/tasks/DepartmentSelect';
import { ArrowRight, Loader2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MOTIVOS_FECHA = [
  { value: 'CLIENTE', label: 'Cliente' },
  { value: 'ALCANCE', label: 'Cambio de alcance' },
  { value: 'FUERZA_MAYOR', label: 'Fuerza mayor' },
  { value: 'INTERNO', label: 'Interno (nuestra culpa)' },
];

interface MiniUser { id: string; nombre: string; avatar_url?: string | null }

interface HandoffTask {
  id: string;
  titulo_tarea: string;
  department_id?: string | null;
  department_nombre?: string | null;
  department_color?: string | null;
  fecha_entrega?: string | null;
}

export function HandoffDialog({
  open,
  onClose,
  task,
  users,
  onDone,
  initialToDeptId,
}: {
  open: boolean;
  onClose: () => void;
  task: HandoffTask | null;
  users: MiniUser[];
  onDone: () => void;
  initialToDeptId?: string | null;
}) {
  const { departments } = useDepartments();
  const [toDeptId, setToDeptId] = useState<string>('');
  const [respIds, setRespIds] = useState<string[]>([]);
  const [motivo, setMotivo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [motivoResched, setMotivoResched] = useState('');
  const [comentarioResched, setComentarioResched] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const currentDept = useMemo(
    () => departments.find((d) => d.id === task?.department_id),
    [departments, task?.department_id]
  );

  // Al abrir: pre-cargar el siguiente departamento sugerido
  useEffect(() => {
    if (!open || !task) return;
    const suggestedNext = initialToDeptId || currentDept?.next_department_id || '';
    setToDeptId(suggestedNext);
    setRespIds([]);
    setMotivo('');
    setDueDate('');
    setMotivoResched('');
    setComentarioResched('');
    setSearch('');
  }, [open, task, currentDept, initialToDeptId]);

  // La fecha solo "cambia" si es distinta de la que ya tiene la tarea.
  const fechaActual = task?.fecha_entrega ? String(task.fecha_entrega).slice(0, 10) : '';
  const fechaCambio = !!dueDate && dueDate !== fechaActual;

  const activeDepts = departments.filter((d) => d.activo && d.id !== task?.department_id);
  const toDept = departments.find((d) => d.id === toDeptId);

  const filteredUsers = users.filter((u) =>
    u.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const toggleResp = (id: string) => {
    setRespIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleConfirm = async () => {
    if (!task || !toDeptId) {
      toast.error('Elige el departamento destino');
      return;
    }
    if (fechaCambio && !motivoResched) {
      toast.error('Indica el motivo del cambio de fecha');
      return;
    }
    setSaving(true);
    try {
      await api.taskHandoff(task.id, {
        to_department_id: toDeptId,
        to_responsable_ids: respIds,
        motivo: motivo.trim() || undefined,
        due_date: dueDate || undefined,
        create_new_task: false,
        motivo_reschedule: fechaCambio ? motivoResched : undefined,
        comentario_reschedule: fechaCambio && comentarioResched.trim() ? comentarioResched.trim() : undefined,
      });
      toast.success(`Tarea pasada a ${toDept?.nombre}`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo pasar la tarea');
    } finally {
      setSaving(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            Pasar a siguiente etapa
          </DialogTitle>
          <DialogDescription className="line-clamp-1">{task.titulo_tarea}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Flujo visual actual → destino */}
          <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/30 p-3">
            {task.department_nombre
              ? <DepartmentBadge nombre={task.department_nombre} color={task.department_color} />
              : <span className="text-xs text-muted-foreground">Sin departamento</span>}
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            {toDept
              ? <DepartmentBadge nombre={toDept.nombre} color={toDept.color} />
              : <span className="text-xs text-muted-foreground">Elegir destino…</span>}
          </div>

          {/* Departamento destino */}
          <div className="space-y-1.5">
            <Label className="text-xs">Departamento destino *</Label>
            <div className="flex flex-wrap gap-1.5">
              {activeDepts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setToDeptId(d.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    toDeptId === d.id ? 'ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: `${d.color || '#94a3b8'}1a`,
                    borderColor: `${d.color || '#94a3b8'}66`,
                    color: d.color || '#475569',
                  }}
                >
                  {d.nombre}
                </button>
              ))}
            </div>
          </div>

          {/* Responsables */}
          <div className="space-y-1.5">
            <Label className="text-xs">Responsable(s) en el nuevo departamento</Label>
            <Input
              placeholder="Buscar persona…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <ScrollArea className="h-32 rounded-md border">
              <div className="p-2 space-y-1">
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">Sin resultados</p>
                ) : filteredUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={respIds.includes(u.id)} onCheckedChange={() => toggleResp(u.id)} />
                    <span className="text-sm">{u.nombre}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Motivo + fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Nota / instrucción (opcional)</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Falta aprobar copy antes de diseñar…"
                rows={2}
                maxLength={1000}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Nueva fecha de entrega (opcional)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Si se mueve la fecha, exigir motivo: no se puede mover la vara del cumplimiento en silencio */}
          {fechaCambio && (
            <div className="space-y-1.5 rounded-lg border border-amber-300/70 bg-amber-50/60 dark:bg-amber-950/20 p-2.5">
              <Label className="text-xs font-medium">Motivo del cambio de fecha *</Label>
              <p className="text-[11px] text-muted-foreground">
                Si el motivo es <strong>Interno</strong>, el cumplimiento se sigue midiendo contra la fecha original.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {MOTIVOS_FECHA.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMotivoResched(m.value)}
                    className={cn(
                      'px-2 py-1 rounded-md border text-xs transition',
                      motivoResched === m.value ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Input
                value={comentarioResched}
                onChange={(e) => setComentarioResched(e.target.value)}
                placeholder="Comentario (opcional)"
                className="h-8 text-sm mt-1"
              />
            </div>
          )}

          {/* Se pasa SIEMPRE la misma tarea: no se duplica y se conservan los comentarios */}
          <p className="text-[11px] text-muted-foreground italic px-1">
            Se pasa la <strong>misma</strong> tarea al nuevo departamento: no se duplica y se conserva todo el
            historial de comentarios. Quien la pasa queda como <strong>seguidor</strong> (la sigue viendo y recibe
            avisos, sin que le cuente al cumplimiento).
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={saving || !toDeptId || (fechaCambio && !motivoResched)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}
              Pasar tarea
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
