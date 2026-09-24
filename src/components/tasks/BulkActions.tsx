import { useState } from 'react';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Trash2, Archive, CheckSquare, Pencil, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  selectedIds: Set<string>;
  onClear: () => void;
  onComplete: () => void;
  users?: { id: string; nombre: string }[];
  sprints?: { id: string; name: string }[];
  /** Carpetas de la mesa activa: "Mover a carpeta…" en lote */
  folders?: { id: string; nombre: string }[];
  /** Editar la tarea seleccionada (solo aplica cuando hay exactamente una) */
  onEditOne?: (taskId: string) => void;
  /** Abrir la ficha completa de la tarea seleccionada */
  onOpenOne?: (taskId: string) => void;
}

const estados = [
  { value: 'backlog', label: 'Pendiente' },
  { value: 'ajustes', label: 'Ajustes' },
  { value: 'en_proceso', label: 'En Proceso' },
  { value: 'en_revision', label: 'En Revisión' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'bloqueado', label: 'Bloqueado' },
];

const prioridades = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
];

export function BulkActions({ selectedIds, onClear, onComplete, users, sprints, folders, onEditOne, onOpenOne }: Props) {
  const { isAdmin, isEjecutivo } = useAuth();
  const [saving, setSaving] = useState(false);
  const count = selectedIds.size;

  if (count === 0) return null;

  const handleBulkUpdate = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.bulkUpdateTasks(Array.from(selectedIds), updates);
      toast.success(`${count} tarea${count !== 1 ? 's' : ''} actualizada${count !== 1 ? 's' : ''}`);
      onClear();
      onComplete();
    } catch {
      toast.error('Error en operación masiva');
    }
    setSaving(false);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${count} tarea${count !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      await api.bulkDeleteTasks(Array.from(selectedIds));
      toast.success(`${count} tarea${count !== 1 ? 's' : ''} eliminada${count !== 1 ? 's' : ''}`);
      onClear();
      onComplete();
    } catch {
      toast.error('Error al eliminar');
    }
    setSaving(false);
  };

  const handleMarkDone = async () => {
    setSaving(true);
    try {
      await api.bulkUpdateTasks(Array.from(selectedIds), { check_done: true });
      toast.success(`${count} tarea${count !== 1 ? 's' : ''} marcada${count !== 1 ? 's' : ''} como hecha${count !== 1 ? 's' : ''}`);
      onClear();
      onComplete();
    } catch {
      toast.error('Error al marcar como hecho');
    }
    setSaving(false);
  };

  return (
    <div className="fixed bottom-4 sm:bottom-6 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 bg-card border border-border shadow-2xl rounded-xl px-3 sm:px-4 py-3 flex items-center gap-2 flex-wrap sm:max-w-[calc(100vw-3rem)] w-auto animate-in slide-in-from-bottom-4 duration-200">
      {/* Contador */}
      <div className="flex items-center gap-2 pr-3 border-r border-border">
        <span className="text-sm font-semibold text-foreground">{count} seleccionada{count !== 1 ? 's' : ''}</span>
      </div>

      {/* Cambiar estado en bulk */}
      <Select disabled={saving} onValueChange={(v) => handleBulkUpdate({ estado: v })}>
        <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
          <SelectValue placeholder="Cambiar estado" />
        </SelectTrigger>
        <SelectContent>
          {estados.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Cambiar prioridad en bulk */}
      <Select disabled={saving} onValueChange={(v) => handleBulkUpdate({ prioridad: v })}>
        <SelectTrigger className="h-8 w-full sm:w-[130px] text-xs">
          <SelectValue placeholder="Prioridad" />
        </SelectTrigger>
        <SelectContent>
          {prioridades.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Asignar responsable */}
      {users && users.length > 0 && (
        <Select disabled={saving} onValueChange={(v) => handleBulkUpdate({ responsable_user_id: v })}>
          <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
            <SelectValue placeholder="Asignar a…" />
          </SelectTrigger>
          <SelectContent>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {/* Mover a carpeta (solo admin/ejecutivo: organizar es del ejecutivo) */}
      {(isAdmin || isEjecutivo) && folders && folders.length > 0 && (
        <Select disabled={saving} onValueChange={(v) => handleBulkUpdate({ folder_id: v === '__none__' ? null : v })}>
          <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
            <SelectValue placeholder="Carpeta…" />
          </SelectTrigger>
          <SelectContent>
            {folders.map(fo => <SelectItem key={fo.id} value={fo.id}>{fo.nombre}</SelectItem>)}
            <SelectItem value="__none__">Quitar de carpeta</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Sprints */}
      {sprints && sprints.length > 0 && (
        <Select disabled={saving} onValueChange={(v) => handleBulkUpdate({ sprint_id: v })}>
          <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
            <SelectValue placeholder="Sprint" />
          </SelectTrigger>
          <SelectContent>
            {sprints.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {/* Editar / Abrir: solo con UNA tarea seleccionada (incidencia bafba91d:
          la barra no permitia editar, solo acciones masivas) */}
      {count === 1 && (onEditOne || onOpenOne) && (
        <>
          <div className="hidden sm:block w-px h-6 bg-border mx-1" />
          {onEditOne && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => { const id = Array.from(selectedIds)[0]; onClear(); onEditOne(id); }}
              disabled={saving}
            >
              <Pencil className="w-3.5 h-3.5 text-amber-500" />
              Editar
            </Button>
          )}
          {onOpenOne && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => { const id = Array.from(selectedIds)[0]; onClear(); onOpenOne(id); }}
              disabled={saving}
            >
              <Eye className="w-3.5 h-3.5 text-primary" />
              Abrir
            </Button>
          )}
        </>
      )}

      <div className="hidden sm:block w-px h-6 bg-border mx-1" />

      {/* Marcar como hecho */}
      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleMarkDone} disabled={saving}>
        <CheckSquare className="w-3.5 h-3.5 text-green-500" />
        Marcar hecho
      </Button>

      {/* Archivar = pasar a estado entregado */}
      {(isAdmin || isEjecutivo) && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => handleBulkUpdate({ estado: 'entregado' })}
          disabled={saving}
        >
          <Archive className="w-3.5 h-3.5 text-blue-500" />
          Archivar
        </Button>
      )}

      {/* Eliminar */}
      {(isAdmin || isEjecutivo) && (
        <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" onClick={handleBulkDelete} disabled={saving}>
          <Trash2 className="w-3.5 h-3.5" />
          Eliminar
        </Button>
      )}

      {/* Cerrar selección */}
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 ml-1" onClick={onClear} title="Cancelar selección">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
