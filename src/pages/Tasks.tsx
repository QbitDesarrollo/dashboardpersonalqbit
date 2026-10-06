import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';
import { getDaysRemaining, getDepartmentColor, getPriorityColor, getStatusColor, getStatusLabel, parseLocalDate } from '@/lib/tareasLista';
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Pencil,
  Copy,
  FolderKanban,
  Bookmark,
  BookmarkPlus,
  MessageSquare,
  Paperclip,
  Calendar,
  Loader2,
  X,
  Check,
  Timer,
  Package,
  LayoutGrid,
  Columns3,
  GanttChart,
  ChevronDown,
  ChevronRight,
  Link2,
  Star,
  SlidersHorizontal,
  Repeat,
  Clock,
  Filter,
  Workflow,
  EyeOff,
  RotateCcw,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { TaskTimer } from '@/components/tasks/TaskTimer';
import { TaskFiles } from '@/components/tasks/TaskFiles';
import { DeliverableProgress } from '@/components/tasks/DeliverableProgress';
import { SubtaskList } from '@/components/tasks/SubtaskList';
import { TaskHistorial } from '@/components/tasks/TaskHistorial';
import { ResponsableMetrics } from '@/components/tasks/ResponsableMetrics';
import { TodayMeetings } from '@/components/TodayMeetings';
import { CommentsPanel } from '@/components/tasks/CommentsPanel';
import { BulkActions } from '@/components/tasks/BulkActions';
import { formatTimeDisplay } from '@/hooks/useTaskTimer';
import { RichTextViewer } from '@/components/RichTextEditor';
import { DepartmentBadge, useDepartments } from '@/components/tasks/DepartmentSelect';
import { TaskFormDialog } from '@/components/tasks/form/TaskFormDialog';
import { FiltroProyecto } from '@/components/tasks/FiltroProyecto';
import { HandoffDialog } from '@/components/tasks/HandoffDialog';
import type { Brand, ColKey, Desk, Profile, Task } from '@/components/tasks/lista/tipos';
import { FilaTarea, type AccionesFila } from '@/components/tasks/lista/FilaTarea';
import { useAccionesEstables } from '@/hooks/useAccionesEstables';
import { guardarFiltros, leerFiltros, SIN_FILTROS } from '@/lib/filtrosTareas';

export default function Tasks() {
  const [searchParams] = useSearchParams();
  const { profile, isAdmin, isEjecutivo, isEquipo } = useAuth();
  const { pinnedDeskId, pinnedBrandId } = useGlobalFilter();
  const { departments } = useDepartments();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [filterDeskMembers, setFilterDeskMembers] = useState<Profile[]>([]);
  const [filterDeskBrands, setFilterDeskBrands] = useState<Brand[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // Filters this person left on last time (localStorage). A ?responsable= link wins over them, and a
  // project link (?brand=&project=, "Ver en Tareas") opens with that project only.
  const [recordados] = useState(() => leerFiltros(profile?.id));
  const [desdeEnlace] = useState(() => {
    const project = searchParams.get('project');
    return project ? { ...SIN_FILTROS, brand: searchParams.get('brand') || 'all', project } : null;
  });
  const inicial = desdeEnlace ?? recordados ?? SIN_FILTROS;
  const [filterBrand, setFilterBrand] = useState<string>(inicial.brand);
  const [filterProject, setFilterProject] = useState<string>(inicial.project);
  const [filterDesk, setFilterDesk] = useState<string>(inicial.desk);
  const [filterStatus, setFilterStatus] = useState<string>(inicial.status);
  const [filterPriority, setFilterPriority] = useState<string>(inicial.priority);
  const [filterResponsable, setFilterResponsable] = useState<string>(() => searchParams.get('responsable') || inicial.responsable);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskReads, setTaskReads] = useState<{ user_id: string; read_at: string; nombre: string; avatar_url: string | null }[]>([]);
  const [tareaEditando, setTareaEditando] = useState<Task | null>(null);
  const [page, setPage] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [savedFilters, setSavedFilters] = useState<{ id: string; name: string; filter_config: Record<string, unknown> }[]>([]);
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  const [saveFilterSaving, setSaveFilterSaving] = useState(false);
  const [siteSettings, setSiteSettings] = useState<Record<string, string | null>>({});
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [groupBy, setGroupBy] = useState<'estado' | 'mes' | 'departamento' | 'responsable' | 'carpeta' | 'mes_carpeta'>('estado');
  // Carpetas de la mesa activa (agrupan tareas estilo ClickUp; reunión Steven 22-ago)
  const [folders, setFolders] = useState<{ id: string; desk_id: string; nombre: string; parent_folder_id?: string | null; tareas?: number; tareas_listas?: number }[]>([]);
  const [filterFolder, setFilterFolder] = useState<string>('all');
  // Diálogo propio para TODO lo de carpetas (nada de prompt/confirm del navegador)
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; mode: 'create' | 'rename' | 'template' | 'delete'; folderId?: string; nombre: string } | null>(null);
  const [folderSaving, setFolderSaving] = useState(false);
  // Drag & drop de tareas hacia los chips de carpeta
  const dragTaskId = useRef<string | null>(null);
  const [isDraggingTask, setIsDraggingTask] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [foldersCollapsed, setFoldersCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('tasks_folders_collapsed') === 'true'; } catch { return false; }
  });

  // Arrastre de CARPETAS (para meterlas en otras — 1 nivel máximo)
  const dragFolderId = useRef<string | null>(null);
  const [isDraggingFolder, setIsDraggingFolder] = useState(false);

  const nestFolder = async (childId: string, parentId: string | null) => {
    dragFolderId.current = null;
    setIsDraggingFolder(false);
    setDragOverFolder(null);
    if (childId === parentId) return;
    try {
      await api.moveTaskFolder(childId, parentId);
      const child = folders.find((x) => x.id === childId)?.nombre;
      const parent = parentId ? folders.find((x) => x.id === parentId)?.nombre : null;
      toast.success(parentId ? `"${child}" ahora está dentro de "${parent}"` : `"${child}" volvió al nivel principal`);
      if (activeDeskId) reloadFolders(activeDeskId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(/nivel|subcarpetas|misma/.test(msg) ? msg.replace(/.*"error":"([^"]+)".*/, '$1') : 'No se pudo mover la carpeta');
    }
  };

  const dropOnFolder = async (folderId: string | null) => {
    // ¿Lo que viene volando es una carpeta? Entonces es anidar, no mover tareas
    if (dragFolderId.current) { nestFolder(dragFolderId.current, folderId); return; }
    const id = dragTaskId.current;
    dragTaskId.current = null;
    setIsDraggingTask(false);
    setDragOverFolder(null);
    if (!id || !(isAdmin || isEjecutivo)) return;
    // Si la tarea arrastrada esta seleccionada, viajan todas las seleccionadas
    const ids = selectedIds.has(id) ? Array.from(selectedIds) : [id];
    try {
      await api.bulkUpdateTasks(ids, { folder_id: folderId });
      const nombre = folderId ? folders.find((x) => x.id === folderId)?.nombre : null;
      toast.success(folderId
        ? `${ids.length === 1 ? 'Tarea movida' : `${ids.length} tareas movidas`} a "${nombre}"`
        : `${ids.length === 1 ? 'Tarea' : `${ids.length} tareas`} sin carpeta`);
      if (ids.length > 1) setSelectedIds(new Set());
      fetchData();
      if (activeDeskId) reloadFolders(activeDeskId);
    } catch { toast.error('No se pudo mover'); }
  };

  const reloadFolders = (deskId: string) => api.getTaskFolders(deskId).then(setFolders).catch(() => setFolders([]));

  const submitFolderDialog = async () => {
    if (!folderDialog || folderSaving) return;
    const { mode, folderId, nombre } = folderDialog;
    if (mode !== 'delete' && !nombre.trim()) { toast.error('Escribe un nombre'); return; }
    setFolderSaving(true);
    try {
      if (mode === 'create' && activeDeskId) {
        await api.createTaskFolder(activeDeskId, nombre.trim());
        toast.success(`Carpeta "${nombre.trim()}" creada`);
      } else if (mode === 'rename' && folderId) {
        await api.renameTaskFolder(folderId, nombre.trim());
        toast.success('Carpeta renombrada');
      } else if (mode === 'template' && folderId) {
        const r = await api.saveFolderAsTemplate(folderId, nombre.trim() || undefined);
        toast.success(`Plantilla "${r.name}" creada con ${r.tareas} tareas — está en el módulo Plantillas`);
      } else if (mode === 'delete' && folderId) {
        await api.deleteTaskFolder(folderId);
        if (filterFolder === folderId) setFilterFolder('all');
        toast.success('Carpeta eliminada (las tareas quedaron sin carpeta)');
      }
      if (activeDeskId) reloadFolders(activeDeskId);
      if (mode !== 'create') fetchData();
      setFolderDialog(null);
    } catch {
      toast.error(mode === 'create' ? 'No se pudo crear (¿nombre repetido?)' : 'No se pudo completar la acción');
    }
    setFolderSaving(false);
  };

  // Chip de carpeta: con selección activa MUEVE las tareas; sin selección, filtra
  // Tile de carpeta (hoja o hija). Reusado por el panel.
  const renderFolderTile = (fo: { id: string; nombre: string; tareas?: number; tareas_listas?: number; parent_folder_id?: string | null }, esHija: boolean) => {
    const total = fo.tareas ?? 0;
    const listas = fo.tareas_listas ?? 0;
    const activa = filterFolder === fo.id;
    return (
      <button
        key={fo.id}
        draggable={(isAdmin || isEjecutivo)}
        onDragStart={(e) => { e.stopPropagation(); dragFolderId.current = fo.id; setIsDraggingFolder(true); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { dragFolderId.current = null; setIsDraggingFolder(false); setDragOverFolder(null); }}
        onClick={() => onFolderChipClick(fo.id)}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverFolder(fo.id); }}
        onDragLeave={() => setDragOverFolder((p) => (p === fo.id ? null : p))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnFolder(fo.id); }}
        title={selectedIds.size > 0 ? `Mover la selección a "${fo.nombre}"` : (activa ? 'Quitar filtro' : `Ver solo "${fo.nombre}"`)}
        className={cn(
          esHija ? 'w-[190px]' : 'w-[210px]',
          'text-left rounded-lg border p-2.5 transition-all cursor-grab active:cursor-grabbing',
          activa ? 'bg-teal-600 border-teal-600 text-white shadow-md' : 'bg-background border-border hover:border-teal-400 hover:shadow-sm',
          dragOverFolder === fo.id && 'ring-2 ring-teal-500 ring-offset-1 scale-[1.03]'
        )}
      >
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-xs font-semibold truncate">📁 {fo.nombre}</span>
          {activa && selectedIds.size === 0 && (isAdmin || isEjecutivo) && (
            <span className="flex items-center gap-1.5 shrink-0">
              <span role="button" title="Renombrar" className="opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setFolderDialog({ open: true, mode: 'rename', folderId: fo.id, nombre: fo.nombre }); }}><Pencil className="h-3 w-3" /></span>
              <span role="button" title="Dejar como plantilla" className="opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setFolderDialog({ open: true, mode: 'template', folderId: fo.id, nombre: fo.nombre }); }}><Copy className="h-3 w-3" /></span>
              <span role="button" title="Eliminar carpeta" className="opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setFolderDialog({ open: true, mode: 'delete', folderId: fo.id, nombre: fo.nombre }); }}><Trash2 className="h-3 w-3" /></span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={cn('h-1.5 flex-1 rounded-full overflow-hidden', activa ? 'bg-white/25' : 'bg-muted-foreground/15')}>
            <span className={cn('block h-full rounded-full transition-all', activa ? 'bg-white' : 'bg-teal-500')}
              style={{ width: total > 0 ? `${Math.round((listas / total) * 100)}%` : '0%' }} />
          </span>
          <span className={cn('text-[10px] font-semibold shrink-0', activa ? 'text-white/85' : 'text-muted-foreground')}>{listas}/{total}</span>
        </div>
      </button>
    );
  };

  const onFolderChipClick = async (folderId: string | null) => {
    if (selectedIds.size > 0 && (isAdmin || isEjecutivo)) {
      try {
        await api.bulkUpdateTasks(Array.from(selectedIds), { folder_id: folderId });
        const nombre = folderId ? folders.find((x) => x.id === folderId)?.nombre : null;
        toast.success(folderId ? `${selectedIds.size} tarea(s) movida(s) a "${nombre}"` : `${selectedIds.size} tarea(s) sin carpeta`);
        setSelectedIds(new Set());
        fetchData();
        if (activeDeskId) reloadFolders(activeDeskId);
      } catch { toast.error('No se pudieron mover'); }
      return;
    }
    const key = folderId ?? '__none__';
    setFilterFolder((prev) => (prev === key ? 'all' : key));
  };
  // Quick-add estilo Monday: crear tarea inline al pie de cada grupo
  const [quickAddGroup, setQuickAddGroup] = useState<string | null>(null);
  const [qaTitle, setQaTitle] = useState('');
  const [qaBrand, setQaBrand] = useState<string>(() => localStorage.getItem('tasks_qa_brand') || '');
  const [qaFecha, setQaFecha] = useState('');
  const [qaSaving, setQaSaving] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [subtasksCache, setSubtasksCache] = useState<Record<string, { id: string; titulo_tarea: string; check_done: boolean }[]>>({});
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<Record<string, string>>({});
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelectTask = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const ALL_COLUMNS: { key: ColKey; label: string }[] = [
    { key: 'marca', label: 'Marca' },
    { key: 'mesa', label: 'Mesa' },
    { key: 'depto', label: 'Depto' },
    { key: 'responsable', label: 'Responsable' },
    { key: 'entregables', label: 'Entregables' },
    { key: 'timer', label: 'Timer' },
    { key: 'archivos', label: 'Archivos' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'prioridad', label: 'Prioridad' },
    { key: 'estado', label: 'Estado' },
    { key: 'entrega', label: 'Fecha Entrega' },
    { key: 'dias', label: 'Días' },
    { key: 'enlace', label: 'Enlace' },
    { key: 'autor', label: 'Autor' },
    { key: 'creado', label: 'Creado' },
  ];
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem('tasks_visible_cols');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { marca: true, mesa: true, depto: true, responsable: true, entregables: true, timer: true, archivos: true, tipo: false, prioridad: true, estado: true, entrega: true, dias: false, enlace: false, autor: false, creado: false };
  });

  const toggleCol = (key: ColKey) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('tasks_visible_cols', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const pageSize = 100;

  // Debounce del término de búsqueda para no saturar el servidor
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Distingue la carga inicial de las recargas: solo la inicial puede
  // mostrar el spinner de pantalla completa (ver nota en el guard de abajo).
  const [primeraCarga, setPrimeraCarga] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const canDeleteTasks =
    (siteSettings.can_delete_tasks_roles || 'admin,ejecutivo').split(',').map((r) => r.trim()).includes(profile?.rol || '') ?? false;

  useEffect(() => {
    fetchData();
  }, [page, filterResponsable, filterBrand, filterProject, filterDesk, filterStatus, filterPriority, debouncedSearch, pinnedDeskId, pinnedBrandId]);

  // Reset to page 0 when any filter changes
  useEffect(() => {
    setPage(0);
  }, [filterResponsable, filterBrand, filterProject, filterDesk, filterStatus, filterPriority, debouncedSearch, pinnedDeskId, pinnedBrandId]);

  // Projects belong to a brand: changing the brand resets the project filter
  // (not on the first render, which may bring a remembered project).
  const marcaFiltrada = filterBrand !== 'all' ? filterBrand : (pinnedBrandId || 'all');
  const marcaAnterior = useRef(marcaFiltrada);
  useEffect(() => {
    if (marcaAnterior.current === marcaFiltrada) return;
    marcaAnterior.current = marcaFiltrada;
    setFilterProject('all');
  }, [marcaFiltrada]);

  useEffect(() => {
    guardarFiltros(profile?.id, {
      brand: filterBrand, project: filterProject, desk: filterDesk,
      status: filterStatus, priority: filterPriority, responsable: filterResponsable,
    });
  }, [profile?.id, filterBrand, filterProject, filterDesk, filterStatus, filterPriority, filterResponsable]);

  useEffect(() => {
    const r = searchParams.get('responsable');
    if (r) setFilterResponsable(r);
  }, [searchParams]);

  // Auto-open task detail from query param (e.g. desde email, notificación, daily, link copiado).
  // Detecta cambios en el query param ?task=... y abre/recarga el modal cada vez que cambie.
  // El panel de detalle necesita campos que la LISTA no trae (seguidores,
  // cambios, tiempo por persona). Se completan con GET /tasks/:id al abrirlo.
  const enrichedTaskId = useRef<string | null>(null);
  useEffect(() => {
    const id = selectedTask?.id;
    if (!detailDialogOpen || !id) { enrichedTaskId.current = null; return; }
    if (enrichedTaskId.current === id) return;
    enrichedTaskId.current = id;
    api.getTask(id).then((full: any) => {
      if (!full || full.id !== id) return;
      setSelectedTask((prev) => (prev && prev.id === id ? { ...prev, ...full } : prev));
    }).catch(() => {});
  }, [detailDialogOpen, selectedTask?.id]);

  const reloadSelectedTask = () => {
    const id = selectedTask?.id;
    if (!id) return;
    api.getTask(id).then((full: any) => {
      if (full && full.id === id) setSelectedTask((prev) => (prev && prev.id === id ? { ...prev, ...full } : prev));
    }).catch(() => {});
  };

  const toggleSeguirTarea = async () => {
    const t = selectedTask;
    if (!t?.id) return;
    try {
      if (t.me_sigue) await api.dejarDeSeguirTarea(t.id);
      else await api.seguirTarea(t.id);
      reloadSelectedTask();
      toast.success(t.me_sigue ? 'Dejaste de seguir la tarea' : 'Ahora sigues esta tarea');
    } catch (e: any) {
      toast.error('Error', { description: e?.message });
    }
  };

  const lastDeepLinkTaskId = useRef<string | null>(null);
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId) {
      // Si quitaron el param y el modal estaba abierto via deep-link, cerrar
      if (lastDeepLinkTaskId.current && detailDialogOpen) {
        setDetailDialogOpen(false);
        setSelectedTask(null);
      }
      lastDeepLinkTaskId.current = null;
      return;
    }
    // Evitar refetch si ya estamos mostrando esa misma tarea
    if (lastDeepLinkTaskId.current === taskId && selectedTask?.id === taskId) {
      // pero asegurar que el modal esté abierto (puede haberlo cerrado y vuelto a clickear la misma notif)
      if (!detailDialogOpen) setDetailDialogOpen(true);
      return;
    }
    lastDeepLinkTaskId.current = taskId;
    api.getTask(taskId).then((task: any) => {
      if (task && task.id) {
        setSelectedTask(task as Task);
        setDetailDialogOpen(true);
      }
    }).catch(() => {
      toast.error('No se pudo cargar la tarea');
    });
  }, [searchParams]);

  // Cargar miembros y marcas de la mesa seleccionada para sincronizar dropdowns
  useEffect(() => {
    const effectiveDesk = filterDesk !== 'all' ? filterDesk : (pinnedDeskId || null);
    if (effectiveDesk) {
      api.getProfiles(effectiveDesk)
        .then((data) => {
          const members = Array.isArray(data) ? data : [];
          setFilterDeskMembers(members);
          if (filterResponsable !== 'all' && !members.some((m: Profile) => m.id === filterResponsable)) {
            setFilterResponsable('all');
          }
        })
        .catch(() => setFilterDeskMembers([]));

      api.getDeskBrands(effectiveDesk)
        .then((data) => {
          const ds = Array.isArray(data) ? data : [];
          setFilterDeskBrands(ds);
          // Si la marca actual no está asignada a esta mesa, resetear (a menos que la mesa no tenga marcas → dejar libre)
          if (ds.length > 0 && filterBrand !== 'all' && !ds.some((b: Brand) => b.id === filterBrand)) {
            setFilterBrand('all');
          }
        })
        .catch(() => setFilterDeskBrands([]));
    } else {
      setFilterDeskMembers([]);
      setFilterDeskBrands([]);
    }
  }, [filterDesk, pinnedDeskId]);

  useEffect(() => {
    if (isAdmin || isEjecutivo || isEquipo) {
      api.getSavedFilters().then((data) => setSavedFilters(Array.isArray(data) ? data : [])).catch(() => {});
    }
  }, [isAdmin, isEjecutivo, isEquipo]);

  useEffect(() => {
    api.getSiteSettings().then((s) => setSiteSettings(s || {})).catch(() => {});
  }, []);

  // Track task reads when detail dialog opens
  useEffect(() => {
    if (detailDialogOpen && selectedTask) {
      api.markTaskRead(selectedTask.id).catch(() => {});
      api.getTaskReads(selectedTask.id)
        .then((data) => setTaskReads(Array.isArray(data) ? data : []))
        .catch(() => setTaskReads([]));
      // Update local is_read state
      setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, is_read: true } : t));
    } else {
      setTaskReads([]);
    }
  }, [detailDialogOpen, selectedTask?.id]);

  const appliedDefaultRef = useRef(false);
  useEffect(() => {
    // Remembered filters are what the person chose last; the default saved filter only applies without them.
    if (appliedDefaultRef.current || recordados || desdeEnlace || savedFilters.length === 0) return;
    const def = savedFilters.find((f) => (f as { is_default?: number }).is_default);
    if (!def?.filter_config || typeof def.filter_config !== 'object') return;
    appliedDefaultRef.current = true;
    const c = def.filter_config as Record<string, string>;
    if (c.brand_id !== undefined) setFilterBrand(c.brand_id);
    if (c.desk_id !== undefined) setFilterDesk(c.desk_id);
    if (c.estado !== undefined) setFilterStatus(c.estado);
    if (c.prioridad !== undefined) setFilterPriority(c.prioridad);
    if (c.responsable_user_id !== undefined) setFilterResponsable(c.responsable_user_id);
    if (c.search !== undefined) setSearchTerm(c.search);
  }, [savedFilters]);

  const loadSavedFilter = (cfg: Record<string, unknown>) => {
    const c = cfg as Record<string, string>;
    if (c.brand_id !== undefined) setFilterBrand(c.brand_id);
    if (c.desk_id !== undefined) setFilterDesk(c.desk_id);
    if (c.estado !== undefined) setFilterStatus(c.estado);
    if (c.prioridad !== undefined) setFilterPriority(c.prioridad);
    if (c.responsable_user_id !== undefined) setFilterResponsable(c.responsable_user_id);
    if (c.search !== undefined) setSearchTerm(c.search);
  };

  const handleSaveFilter = async () => {
    if (!saveFilterName.trim()) { toast.error('Nombre requerido'); return; }
    setSaveFilterSaving(true);
    try {
      await api.createSavedFilter({
        name: saveFilterName.trim(),
        entity_type: 'tasks',
        filter_config: {
          brand_id: filterBrand,
          desk_id: filterDesk,
          estado: filterStatus,
          prioridad: filterPriority,
          responsable_user_id: filterResponsable,
          search: searchTerm,
        },
      });
      toast.success('Filtro guardado');
      setSaveFilterOpen(false);
      setSaveFilterName('');
      const data = await api.getSavedFilters();
      setSavedFilters(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Error al guardar');
    } finally {
      setSaveFilterSaving(false);
    }
  };

  // Brands, desks and people do not depend on the filters: load them once.
  useEffect(() => {
    Promise.all([api.getBrands(), api.getDesks(), api.getProfiles()])
      .then(([brandsData, desksData, usersData]) => {
        if (Array.isArray(brandsData)) setBrands(brandsData.filter((b: { activo?: unknown }) => b.activo !== 0 && b.activo !== false));
        if (Array.isArray(desksData)) setDesks(desksData.filter((d: { activo?: unknown }) => d.activo !== 0 && d.activo !== false));
        if (Array.isArray(usersData)) setUsers(usersData);
      })
      .catch((error) => {
        console.error('Error fetching catalogs:', error);
        toast.error('Error al cargar datos');
      });
  }, []);

  // A remembered brand or desk that is no longer available would leave the list empty.
  useEffect(() => {
    if (brands.length > 0 && filterBrand !== 'all' && !brands.some((b) => b.id === filterBrand)) setFilterBrand('all');
  }, [brands]);
  useEffect(() => {
    if (desks.length > 0 && filterDesk !== 'all' && !desks.some((d) => d.id === filterDesk)) setFilterDesk('all');
  }, [desks]);

  // Only the latest request may update the list: a slow answer for an older filter is discarded.
  const ultimoPedido = useRef(0);
  const fetchData = async () => {
    const pedido = ++ultimoPedido.current;
    try {
      setLoading(true);
      const tasksRes = await api.getTasks({
        limit: pageSize,
        offset: page * pageSize,
        responsable_user_id: filterResponsable,
        brand_id: filterBrand !== 'all' ? filterBrand : (pinnedBrandId || 'all'),
        desk_id: filterDesk !== 'all' ? filterDesk : (pinnedDeskId || undefined),
        estado: filterStatus,
        prioridad: filterPriority,
        search: debouncedSearch || undefined,
        project_id: filterProject,
        orden: 'entrega',
      });
      if (pedido !== ultimoPedido.current) return;
      setTasks((tasksRes.tasks || []) as Task[]);
      setTotalTasks(tasksRes.total ?? 0);
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      if (pedido === ultimoPedido.current) {
        setLoading(false);
        setPrimeraCarga(false);
      }
    }
  };

  const abrirNuevaTarea = () => {
    setTareaEditando(null);
    setDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setTareaEditando(task);
    setDialogOpen(true);
  };

  const updateTaskStatus = async (taskId: string, status: Task['estado']) => {
    try {
      const result: any = await api.patchTask(taskId, { estado: status });
      if (result?.error) throw new Error(result.error);
      if (result?.recurrence_spawned) {
        toast.success('Estado actualizado', {
          description: 'Se creó la próxima ocurrencia de la tarea recurrente. Búscala en la lista.',
          duration: 7000,
        });
      } else {
        toast.success('Estado actualizado');
      }
      fetchData();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    }
  };

  const updateTaskPriority = async (taskId: string, prioridad: Task['prioridad']) => {
    try {
      const result: any = await api.patchTask(taskId, { prioridad });
      if (result?.error) throw new Error(result.error);
      toast.success('Prioridad actualizada');
      fetchData();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    }
  };

  const toggleCheck = async (taskId: string, checked: boolean) => {
    try {
      const result: any = await api.patchTask(taskId, { check_done: checked });
      if (result?.error) throw new Error(result.error);
      fetchData();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    }
  };

  // Los filtros principales se aplican en el servidor.
  // Aquí solo filtramos combinaciones de dropdown + pinned sidebar cuando ambos están activos.
  const filteredTasks = tasks.filter(task => {
    const matchesBrand = filterBrand === 'all' || task.brand_id === filterBrand;
    // Confiamos en el backend: si pidió mesa, ya devolvió solo tareas de esa mesa (t.desk_id)
    const matchesDesk = true;
    // Mesa-departamento (Planning, Creatividad...): también sus tareas en otras mesas
    const deptoPinned = pinnedDeskId ? (desks.find((d) => d.id === pinnedDeskId) as { department_id?: string | null } | undefined)?.department_id : null;
    const matchesPinnedDesk = !pinnedDeskId || task.desk_id === pinnedDeskId || (!!deptoPinned && task.department_id === deptoPinned);
    const matchesPinnedBrand = !pinnedBrandId || task.brand_id === pinnedBrandId;
    const matchesFolder = (() => {
      if (filterFolder === 'all') return true;
      if (filterFolder === '__none__') return !task.folder_id;
      if (task.folder_id === filterFolder) return true;
      // Si se filtra por una carpeta madre, sus hijas también cuentan
      const tf = folders.find((x) => x.id === task.folder_id);
      return tf?.parent_folder_id === filterFolder;
    })();
    return matchesBrand && matchesDesk && matchesPinnedDesk && matchesPinnedBrand && matchesFolder;
  });

  const statusOrder: Task['estado'][] = ['en_proceso', 'ajustes', 'revision_interna', 'revision_cliente', 'en_revision', 'backlog', 'bloqueado', 'entregado'];

  const quickAddTask = async (groupKey: string, tasksInGroup: Task[]) => {
    if (!qaTitle.trim() || !qaBrand) { toast.error('Pon título y marca'); return; }
    const fecha = qaFecha || (() => { const d = new Date(); d.setDate(d.getDate() + 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const payload: Record<string, unknown> = { titulo_tarea: qaTitle.trim(), brand_id: qaBrand, fecha_entrega: fecha };
    if (groupBy === 'departamento' && groupKey !== 'Por clasificar') {
      const dept = departments.find((d) => d.nombre === groupKey);
      if (dept) {
        payload.department_id = dept.id;
      } else {
        // Bucket legacy huérfano (texto viejo sin departamento real equivalente) — se mantiene tal cual.
        payload.departamento = groupKey;
      }
    }
    if (groupBy === 'estado' && ['backlog', 'en_proceso', 'en_revision', 'entregado', 'bloqueado'].includes(groupKey)) payload.estado = groupKey;
    if (groupBy === 'carpeta' && groupKey !== 'Sin carpeta') {
      const fo = folders.find((x) => x.nombre === groupKey);
      if (fo) payload.folder_id = fo.id;
    }
    if (groupBy === 'mes_carpeta') {
      const folderName = groupKey.split('\u0007')[1];
      if (folderName && folderName !== 'Sin carpeta') {
        const fo = folders.find((x) => x.nombre === folderName);
        if (fo) payload.folder_id = fo.id;
      }
    }
    if (groupBy === 'responsable' && groupKey !== 'Sin asignar') {
      const u = users.find((x) => x.nombre === groupKey);
      if (u) payload.responsable_ids = [u.id];
    }
    setQaSaving(true);
    try {
      const r: any = await api.createTask(payload);
      if (r?.error) throw new Error(r.error);
      localStorage.setItem('tasks_qa_brand', qaBrand);
      toast.success('Tarea creada');
      setQaTitle(''); setQaFecha('');
      fetchData();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo crear'); }
    finally { setQaSaving(false); }
  };

  const getStatusHeaderColor = (estado: string) => {
    const colors: Record<string, string> = {
      backlog: 'bg-[hsl(222,35%,35%)]',
      en_proceso: 'bg-[hsl(199,89%,48%)]',
      en_revision: 'bg-[hsl(38,92%,50%)]',
      ajustes: 'bg-[hsl(24,95%,53%)]',
      revision_interna: 'bg-[hsl(38,92%,50%)]',
      revision_cliente: 'bg-[hsl(271,76%,53%)]',
      aprobado: 'bg-[hsl(142,76%,36%)]',
      entregado: 'bg-[hsl(168,76%,42%)]',
      bloqueado: 'bg-[hsl(0,84%,60%)]',
    };
    return colors[estado] || 'bg-muted';
  };

  const MONTH_HEADER_COLORS = [
    'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500',
    'bg-rose-500', 'bg-lime-500', 'bg-orange-500', 'bg-cyan-500',
    'bg-fuchsia-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500',
  ];
  const getMonthHeaderColor = (monthKey: string) => {
    const idx = monthKey.length > 0 ? (monthKey.charCodeAt(0) + (monthKey.length || 0)) % 12 : 0;
    return MONTH_HEADER_COLORS[idx] || 'bg-muted';
  };

  const activeDeskId = filterDesk !== 'all' ? filterDesk : (pinnedDeskId || null);
  useEffect(() => {
    setFilterFolder('all');
    if (!activeDeskId) { setFolders([]); return; }
    reloadFolders(activeDeskId);
  }, [activeDeskId]);

  const groupedTasks = React.useMemo(() => {
    if (groupBy === 'mes') {
      const byMonth: Record<string, Task[]> = {};
      filteredTasks.forEach((t) => {
        const d = t.fecha_entrega ? t.fecha_entrega.substring(0, 10) : '';
        const [y, m] = d.split('-').map(Number);
        const key = `${y || 0}-${String(m || 1).padStart(2, '0')}`;
        if (!byMonth[key]) byMonth[key] = [];
        byMonth[key].push(t);
      });
      const sorted = Object.keys(byMonth).sort().reverse();
      return sorted.reduce<Record<string, Task[]>>((acc, key) => {
        acc[key] = byMonth[key];
        return acc;
      }, {});
    }
    if (groupBy === 'mes_carpeta') {
      // Mes (de la fecha de entrega) y, dentro, carpeta. Key compuesto "ym\u0007carpeta".
      const byKey: Record<string, Task[]> = {};
      filteredTasks.forEach((t) => {
        const d = t.fecha_entrega ? t.fecha_entrega.substring(0, 10) : '';
        const [y, m] = d.split('-').map(Number);
        const ym = `${y || 0}-${String(m || 1).padStart(2, '0')}`;
        const key = `${ym}\u0007${t.folder_nombre || 'Sin carpeta'}`;
        if (!byKey[key]) byKey[key] = [];
        byKey[key].push(t);
      });
      const sorted = Object.keys(byKey).sort((a, b) => {
        const [ymA, fA] = a.split('\u0007');
        const [ymB, fB] = b.split('\u0007');
        if (ymA !== ymB) return ymB.localeCompare(ymA); // mes reciente primero
        if (fA === 'Sin carpeta') return 1;
        if (fB === 'Sin carpeta') return -1;
        return fA.localeCompare(fB, 'es');
      });
      return sorted.reduce<Record<string, Task[]>>((acc, key) => {
        acc[key] = byKey[key];
        return acc;
      }, {});
    }
    if (groupBy === 'carpeta') {
      const byFolder: Record<string, Task[]> = {};
      filteredTasks.forEach((t) => {
        const key = t.folder_nombre || 'Sin carpeta';
        if (!byFolder[key]) byFolder[key] = [];
        byFolder[key].push(t);
      });
      // Las carpetas vacías también se muestran: recién creadas, aún sin tareas
      folders.forEach((fo) => { if (!byFolder[fo.nombre]) byFolder[fo.nombre] = []; });
      const sorted = Object.keys(byFolder).sort((a, b) =>
        a === 'Sin carpeta' ? 1 : b === 'Sin carpeta' ? -1 : a.localeCompare(b, 'es'));
      return sorted.reduce<Record<string, Task[]>>((acc, key) => {
        acc[key] = byFolder[key];
        return acc;
      }, {});
    }
    if (groupBy === 'responsable') {
      const byResp: Record<string, Task[]> = {};
      filteredTasks.forEach((t) => {
        const names: string[] = [];
        if (t.responsables && t.responsables.length > 0) t.responsables.forEach((r) => names.push(r.nombre || 'Sin nombre'));
        else if (t.responsable_user_id) names.push(users.find((u) => u.id === t.responsable_user_id)?.nombre || 'Sin asignar');
        if (names.length === 0) names.push('Sin asignar');
        names.forEach((n) => { if (!byResp[n]) byResp[n] = []; byResp[n].push(t); });
      });
      const sorted = Object.keys(byResp).sort((a, b) =>
        a === 'Sin asignar' ? 1 : b === 'Sin asignar' ? -1 : a.localeCompare(b, 'es'));
      return sorted.reduce<Record<string, Task[]>>((acc, key) => {
        acc[key] = byResp[key];
        return acc;
      }, {});
    }
    if (groupBy === 'departamento') {
      const byDept: Record<string, Task[]> = {};
      filteredTasks.forEach((t) => {
        const key = t.department_nombre || t.departamento || 'Por clasificar';
        if (!byDept[key]) byDept[key] = [];
        byDept[key].push(t);
      });
      const sorted = Object.keys(byDept).sort((a, b) =>
        a === 'Por clasificar' ? 1 : b === 'Por clasificar' ? -1 : a.localeCompare(b, 'es'));
      return sorted.reduce<Record<string, Task[]>>((acc, key) => {
        acc[key] = byDept[key];
        return acc;
      }, {});
    }
    return statusOrder.reduce<Record<string, Task[]>>((acc, status) => {
      const tasksInGroup = filteredTasks.filter(t => status === 'entregado' ? (t.estado === 'entregado' || t.estado === 'aprobado') : t.estado === status);
      if (tasksInGroup.length > 0) acc[status] = tasksInGroup;
      return acc;
    }, {});
  }, [filteredTasks, groupBy, users, folders]);

  const getGroupLabel = (key: string) => {
    if (groupBy === 'departamento' || groupBy === 'responsable' || groupBy === 'carpeta') return key;
    if (groupBy === 'mes_carpeta') {
      const [ym, folder] = key.split('\u0007');
      const [y, m] = ym.split('-').map(Number);
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      return `${monthNames[(m || 1) - 1]} ${y || '—'} · 📁 ${folder}`;
    }
    if (groupBy === 'mes') {
      const [y, m] = key.split('-').map(Number);
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      return `${monthNames[(m || 1) - 1]} ${y || '—'}`;
    }
    return getStatusLabel(key);
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const toggleTaskExpand = async (taskId: string) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
    if (!subtasksCache[taskId]) {
      try {
        const list = await api.getSubtasks(taskId) as { id: string; titulo_tarea: string; check_done?: boolean | number }[];
        const arr = Array.isArray(list) ? list.map(x => ({ id: x.id, titulo_tarea: x.titulo_tarea, check_done: !!(x.check_done) })) : [];
        setSubtasksCache(c => ({ ...c, [taskId]: arr }));
      } catch {
        setSubtasksCache(c => ({ ...c, [taskId]: [] }));
      }
    }
  };

  const toggleFavorite = async (task: Task) => {
    const next = !task.is_favorite;
    try {
      await api.patchTask(task.id, { is_favorite: next });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_favorite: next } : t));
    } catch {
      toast.error('No se pudo actualizar favorito');
    }
  };

  const handleAddSubtask = async (parentTaskId: string) => {
    const title = newSubtaskTitle[parentTaskId]?.trim();
    if (!title) return;
    setAddingSubtaskFor(parentTaskId);
    try {
      const created = await api.createSubtask(parentTaskId, { titulo_tarea: title }) as { id?: string; titulo_tarea?: string; check_done?: boolean | number } | undefined;
      setNewSubtaskTitle(t => ({ ...t, [parentTaskId]: '' }));
      // Mostrar de inmediato la nueva subtarea (optimistic + respuesta del API)
      const newItem = created && created.id ? { id: created.id, titulo_tarea: created.titulo_tarea || title, check_done: !!(created.check_done) } : null;
      if (newItem) {
        setSubtasksCache(c => ({
          ...c,
          [parentTaskId]: [...(c[parentTaskId] || []), newItem],
        }));
      }
      toast.success('Subtarea creada');
      // Refrescar lista desde el servidor para quedar en sync
      const list = await api.getSubtasks(parentTaskId);
      const arr = Array.isArray(list) ? list.map((x: { id: string; titulo_tarea: string; check_done?: boolean | number }) => ({ id: x.id, titulo_tarea: x.titulo_tarea, check_done: !!(x.check_done) })) : [];
      setSubtasksCache(c => ({ ...c, [parentTaskId]: arr }));
    } catch {
      toast.error('Error al crear subtarea');
    } finally {
      setAddingSubtaskFor(null);
    }
  };

  const refreshSubtasks = async (parentTaskId: string) => {
    try {
      const list = await api.getSubtasks(parentTaskId) as { id: string; titulo_tarea: string; check_done?: boolean | number }[];
      const arr = Array.isArray(list) ? list.map(x => ({ id: x.id, titulo_tarea: x.titulo_tarea, check_done: !!(x.check_done) })) : [];
      setSubtasksCache(c => ({ ...c, [parentTaskId]: arr }));
    } catch {
      setSubtasksCache(c => ({ ...c, [parentTaskId]: c[parentTaskId] || [] }));
    }
  };

  const handleToggleSubtaskDone = async (st: { id: string; check_done: boolean }, parentTaskId: string) => {
    try {
      await api.patchTask(st.id, { check_done: !st.check_done });
      await refreshSubtasks(parentTaskId);
    } catch {
      toast.error('No se pudo actualizar');
    }
  };

  const handleEditSubtask = (st: { id: string; titulo_tarea: string }) => {
    setEditingSubtaskId(st.id);
    setEditingSubtaskTitle(st.titulo_tarea);
  };

  const handleSaveSubtaskEdit = async (stId: string, parentTaskId: string) => {
    const title = editingSubtaskTitle.trim();
    if (!title) return;
    try {
      await api.patchTask(stId, { titulo_tarea: title });
      setEditingSubtaskId(null);
      setEditingSubtaskTitle('');
      await refreshSubtasks(parentTaskId);
      toast.success('Subtarea actualizada');
    } catch {
      toast.error('No se pudo actualizar');
    }
  };

  const handleDeleteSubtask = async (stId: string, parentTaskId: string) => {
    if (!window.confirm('¿Eliminar esta subtarea?')) return;
    try {
      await api.deleteTask(stId);
      await refreshSubtasks(parentTaskId);
      toast.success('Subtarea eliminada');
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const isAssignedTo = (task: Task) =>
    task.responsable_user_id === profile?.id || !!task.responsables?.some(r => r.user_id === profile?.id);

  const canEditTask = (task: Task) => {
    if (isAdmin) return true;
    const isProtected = task.created_by_rol === 'admin' || task.created_by_rol === 'ejecutivo';
    // Ejecutivo: edita cualquier tarea que puede ver (el backend valida el acceso por mesa).
    // Antes solo podia editar las protegidas que el mismo creo y bloqueaba a los demas ejecutivos.
    if (isEjecutivo) return true;
    if (isEquipo) return !isProtected && isAssignedTo(task);
    return false;
  };

  // Equipo can change status/timer on protected tasks if assigned
  const canOperateTask = (task: Task) => {
    if (canEditTask(task)) return true;
    if (isEquipo && isAssignedTo(task)) return true;
    return false;
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('¿Eliminar esta tarea? Se borrarán también subtareas, entregables y archivos.')) return;
    setDeleteTaskId(taskId);
    try {
      await api.deleteTask(taskId);
      toast.success('Tarea eliminada');
      if (selectedTask?.id === taskId) {
        setDetailDialogOpen(false);
        setSelectedTask(null);
      }
      fetchData();
    } catch (e) {
      toast.error((e as Error).message || 'Error al eliminar');
    } finally {
      setDeleteTaskId(null);
    }
  };

  // Stable row handlers: rows are memoized and must not redraw just because the page rendered.
  const accionesFila = useAccionesEstables<AccionesFila>({
    alternarExpandir: toggleTaskExpand,
    alternarSeleccion: toggleSelectTask,
    alternarFavorita: toggleFavorite,
    abrirDetalle: (task) => { setSelectedTask(task); setDetailDialogOpen(true); },
    editar: openEditDialog,
    eliminar: handleDeleteTask,
    cambiarEstado: updateTaskStatus,
    cambiarPrioridad: updateTaskPriority,
    recargar: fetchData,
    abrirSubtarea: (subId) => {
      api.getTask(subId).then((t: any) => {
        if (t && t.id) {
          setSelectedTask(t as Task);
          setDetailDialogOpen(true);
        }
      }).catch(() => toast.error('No se pudo cargar la subtarea'));
    },
    empezarArrastre: (taskId) => { dragTaskId.current = taskId; setIsDraggingTask(true); },
    terminarArrastre: () => { dragTaskId.current = null; setIsDraggingTask(false); setDragOverFolder(null); },
  });
  const filasArrastrables = (isAdmin || isEjecutivo) && !!activeDeskId && folders.length > 0;

  // Solo la PRIMERA carga reemplaza la pantalla. Si se usara `loading` a secas,
  // cada busqueda o cambio de filtro desmontaria la pagina completa: el input
  // perderia el foco y los dialogos abiertos se cerrarian solos.
  if (loading && primeraCarga) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in min-w-0 overflow-x-hidden">
      {/* Tu dia: reuniones de hoy del usuario (carga automatica desde Google Calendar) */}
      <TodayMeetings />

      {/* Header + vista */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Tareas</h2>
            <p className="text-sm text-muted-foreground">Gestiona todas las tareas del equipo</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap w-full sm:w-auto">
            <div className="overflow-x-auto -mx-px sm:overflow-visible">
            <div className="flex gap-1 p-1 rounded-lg bg-muted/50 shrink-0 flex-wrap min-w-0">
              <Button variant="default" size="sm" className="pointer-events-none">
                <LayoutGrid className="h-4 w-4 mr-1.5" />
                Lista
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/tareas/kanban" className="flex items-center gap-1.5">
                  <Columns3 className="h-4 w-4" />
                  Tablero
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/tareas/gantt" className="flex items-center gap-1.5">
                  <GanttChart className="h-4 w-4" />
                  Cronograma
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/tareas/calendario" className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Calendario
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/tareas/workload" className="flex items-center gap-1.5">Carga</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/tareas/tiempo" className="flex items-center gap-1.5">Tiempo</Link>
              </Button>
            </div>
            </div>
            {(isAdmin || isEjecutivo || isEquipo) && (
              <Button className="gradient-primary w-full sm:w-auto" onClick={abrirNuevaTarea}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Tarea
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      {(() => {
        const activeFilterCount = [filterBrand, filterProject, filterDesk, filterStatus, filterPriority, filterResponsable].filter((v) => v !== 'all').length;
        const clearAllFilters = () => {
          setFilterBrand('all');
          setFilterProject('all');
          setFilterDesk('all');
          setFilterStatus('all');
          setFilterPriority('all');
          setFilterResponsable('all');
        };
        const dropdowns = (
          <>
            <div className="space-y-1.5 sm:space-y-0 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground block sm:hidden">Marca</Label>
              <Select value={filterBrand} onValueChange={setFilterBrand}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[120px] h-8 text-xs gap-1"><span className="hidden sm:inline text-muted-foreground">Marca:</span><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(filterDeskBrands.length > 0 ? filterDeskBrands : brands).map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FiltroProyecto brandId={marcaFiltrada} value={filterProject} onChange={setFilterProject} />
            <div className="space-y-1.5 sm:space-y-0 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground block sm:hidden">Mesa</Label>
              <Select value={filterDesk} onValueChange={setFilterDesk}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[100px] h-8 text-xs gap-1"><span className="hidden sm:inline text-muted-foreground">Mesa:</span><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {desks.map((desk) => (<SelectItem key={desk.id} value={desk.id}>{desk.nombre}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:space-y-0 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground block sm:hidden">Estado</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[100px] h-8 text-xs gap-1"><span className="hidden sm:inline text-muted-foreground">Estado:</span><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="backlog">Pendiente</SelectItem>
                  <SelectItem value="en_proceso">En Proceso</SelectItem>
                  <SelectItem value="revision_interna">Revisión interna</SelectItem>
                        <SelectItem value="revision_cliente">Revisión cliente</SelectItem>
                        <SelectItem value="ajustes">Ajustes</SelectItem>
                  <SelectItem value="entregado">Entregado</SelectItem>
                  <SelectItem value="bloqueado">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:space-y-0 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground block sm:hidden">Prioridad</Label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[100px] h-8 text-xs gap-1"><span className="hidden sm:inline text-muted-foreground">Prioridad:</span><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:space-y-0 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground block sm:hidden">Responsable</Label>
              <Select value={filterResponsable} onValueChange={setFilterResponsable}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[110px] h-8 text-xs gap-1"><span className="hidden sm:inline text-muted-foreground">Resp:</span><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(filterDeskMembers.length > 0 ? filterDeskMembers : users).map((user) => (
                    <SelectItem key={user.id} value={user.id}>{user.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        );
        return (
      <Card className="glass-card">
        <CardContent className="p-2 sm:p-2.5 space-y-2">
          {/* Mobile: 1 botón compacto que abre Sheet */}
          <div className="flex sm:hidden items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-start gap-2"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <Filter className="h-4 w-4" />
              <span>Filtros</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">{activeFilterCount}</Badge>
              )}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-9 px-2">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Mobile sheet con todos los filtros */}
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetContent side="right" className="w-[88vw] sm:max-w-md overflow-y-auto">
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <Filter className="h-4 w-4" /> Filtros
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeFilterCount} activos</Badge>
                  )}
                </SheetTitle>
                <SheetDescription>Filtra las tareas por marca, mesa, estado y más.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                {dropdowns}
              </div>
              <div className="flex gap-2 mt-6 pt-4 border-t">
                <Button variant="outline" className="flex-1" onClick={() => { clearAllFilters(); setMobileFiltersOpen(false); }} disabled={activeFilterCount === 0}>
                  Limpiar
                </Button>
                <Button className="flex-1" onClick={() => setMobileFiltersOpen(false)}>Aplicar</Button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex-1 min-w-0 sm:min-w-[160px] w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar tareas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            <div className="hidden sm:contents">{dropdowns}</div>
            <div className="space-y-1.5 sm:space-y-0 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground block sm:hidden">Agrupar por</Label>
              <Select value={groupBy} onValueChange={(v: 'estado' | 'mes' | 'departamento' | 'responsable' | 'carpeta' | 'mes_carpeta') => setGroupBy(v)}>
                <SelectTrigger className="w-full sm:w-auto h-8 text-xs gap-1">
                  <span className="hidden sm:inline text-muted-foreground">Agrupar:</span><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="estado">Estado</SelectItem>
                  <SelectItem value="mes">Mes de entrega</SelectItem>
                  <SelectItem value="departamento">Departamento</SelectItem>
                  <SelectItem value="responsable">Responsable</SelectItem>
                  {activeDeskId && <SelectItem value="carpeta">Carpeta</SelectItem>}
                  {activeDeskId && <SelectItem value="mes_carpeta">Mes → Carpeta</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {(isAdmin || isEjecutivo || isEquipo) && savedFilters.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      <Bookmark className="h-3.5 w-3.5 mr-1" />
                      Filtros
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {savedFilters.map((f) => (
                      <DropdownMenuItem key={f.id} onClick={() => f.filter_config && typeof f.filter_config === 'object' && loadSavedFilter(f.filter_config)}>
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {(isAdmin || isEjecutivo || isEquipo) && (
                <Button variant="outline" size="sm" className="h-8" onClick={() => setSaveFilterOpen(true)} title="Guardar filtro">
                  <BookmarkPlus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
        );
      })()}

      {saveFilterOpen && (
        <Dialog open={saveFilterOpen} onOpenChange={setSaveFilterOpen}>
          <DialogContent aria-describedby="save-filter-desc">
            <DialogHeader>
              <DialogTitle>Guardar filtro</DialogTitle>
              <DialogDescription id="save-filter-desc">Guarda la combinación actual de filtros para usarla después.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Nombre del filtro"
                value={saveFilterName}
                onChange={(e) => setSaveFilterName(e.target.value)}
              />
              <Button onClick={handleSaveFilter} disabled={saveFilterSaving}>{saveFilterSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Apartado de carpetas de la mesa activa (estilo ClickUp) */}
      {activeDeskId && (folders.length > 0 || isAdmin || isEjecutivo) && (
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-3 py-2">
              <button
                onClick={() => { setFoldersCollapsed((v) => { try { localStorage.setItem('tasks_folders_collapsed', String(!v)); } catch { /* ignore */ } return !v; }); }}
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                {foldersCollapsed && !isDraggingTask ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <FolderKanban className="h-4 w-4 text-teal-600" />
                Carpetas
                <Badge variant="secondary" className="text-[10px]">{folders.length}</Badge>
                {isDraggingTask && <span className="text-xs font-medium text-teal-600 animate-pulse ml-1">Suelta en una carpeta</span>}
                {isDraggingFolder && <span className="text-xs font-medium text-teal-600 animate-pulse ml-1">Suéltala dentro de otra carpeta</span>}
                {!isDraggingTask && selectedIds.size > 0 && (isAdmin || isEjecutivo) && folders.length > 0 && (
                  <span className="text-xs font-medium text-primary ml-1">Clic en una para mover {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}</span>
                )}
              </button>
              <div className="flex items-center gap-1.5">
                {selectedIds.size === 0 && filterFolder !== 'all' && (
                  <button onClick={() => setFilterFolder('all')} className="px-2 py-1 rounded-full text-xs text-muted-foreground hover:bg-muted" title="Ver todas las tareas">✕ Ver todas</button>
                )}
                {(isAdmin || isEjecutivo) && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-dashed border-primary/50 text-primary hover:bg-primary/10"
                    onClick={() => setFolderDialog({ open: true, mode: 'create', nombre: '' })}>
                    <Plus className="h-3 w-3" />Crear carpeta
                  </Button>
                )}
              </div>
            </div>
            {(!foldersCollapsed || isDraggingTask || isDraggingFolder) && folders.length > 0 && (
              <div className="flex flex-wrap items-start gap-2 px-3 pb-3">
                {(() => {
                  const hijasDe: Record<string, typeof folders> = {};
                  folders.forEach((x) => { if (x.parent_folder_id) (hijasDe[x.parent_folder_id] ||= []).push(x); });
                  const raices = folders.filter((x) => !x.parent_folder_id);
                  const ordenadas = [...raices.filter((r) => (hijasDe[r.id] || []).length > 0), ...raices.filter((r) => (hijasDe[r.id] || []).length === 0)];
                  return ordenadas.map((root) => {
                    const hijas = hijasDe[root.id] || [];
                    if (hijas.length === 0) return renderFolderTile(root, false);
                    const total = (root.tareas ?? 0) + hijas.reduce((a, h) => a + (h.tareas ?? 0), 0);
                    const listas = (root.tareas_listas ?? 0) + hijas.reduce((a, h) => a + (h.tareas_listas ?? 0), 0);
                    const activa = filterFolder === root.id;
                    return (
                      <div key={root.id} className={cn('rounded-lg border p-2', activa ? 'border-teal-500 bg-teal-50/40 dark:bg-teal-950/30' : 'border-border bg-muted/30', dragOverFolder === root.id && 'ring-2 ring-teal-500')}>
                        <button
                          onClick={() => onFolderChipClick(root.id)}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverFolder(root.id); }}
                          onDragLeave={() => setDragOverFolder((p) => (p === root.id ? null : p))}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnFolder(root.id); }}
                          title={activa ? 'Quitar filtro' : `Ver todo lo de "${root.nombre}" (incluye sus subcarpetas)`}
                          className="w-full flex items-center justify-between gap-2 px-1 pb-1.5 text-left"
                        >
                          <span className={cn('text-xs font-bold flex items-center gap-1.5', activa ? 'text-teal-700 dark:text-teal-300' : 'text-foreground')}>
                            📂 {root.nombre}
                            <span className="text-[10px] font-semibold text-muted-foreground">{listas}/{total}</span>
                          </span>
                          {activa && (isAdmin || isEjecutivo) && (
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span role="button" title="Renombrar" className="opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setFolderDialog({ open: true, mode: 'rename', folderId: root.id, nombre: root.nombre }); }}><Pencil className="h-3 w-3" /></span>
                              <span role="button" title="Dejar como plantilla (incluye subcarpetas)" className="opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setFolderDialog({ open: true, mode: 'template', folderId: root.id, nombre: root.nombre }); }}><Copy className="h-3 w-3" /></span>
                              <span role="button" title="Eliminar carpeta (las subcarpetas suben de nivel)" className="opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setFolderDialog({ open: true, mode: 'delete', folderId: root.id, nombre: root.nombre }); }}><Trash2 className="h-3 w-3" /></span>
                            </span>
                          )}
                        </button>
                        <div className="flex flex-wrap gap-1.5">
                          {hijas.map((h) => renderFolderTile(h, true))}
                        </div>
                      </div>
                    );
                  });
                })()}
                {false && folders.map((fo) => {
                  const total = fo.tareas ?? 0;
                  const listas = fo.tareas_listas ?? 0;
                  const activa = filterFolder === fo.id;
                  return (
                    <button
                      key={fo.id}
                      onClick={() => onFolderChipClick(fo.id)}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverFolder(fo.id); }}
                      onDragLeave={() => setDragOverFolder((p) => (p === fo.id ? null : p))}
                      onDrop={(e) => { e.preventDefault(); dropOnFolder(fo.id); }}
                      title={selectedIds.size > 0 ? `Mover la selección a "${fo.nombre}"` : (activa ? 'Quitar filtro' : `Ver solo "${fo.nombre}"`)}
                      className={cn(
                        'w-[210px] text-left rounded-lg border p-2.5 transition-all',
                        activa ? 'bg-teal-600 border-teal-600 text-white shadow-md' : 'bg-background border-border hover:border-teal-400 hover:shadow-sm',
                        dragOverFolder === fo.id && 'ring-2 ring-teal-500 ring-offset-1 scale-[1.03]'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold truncate">📁 {fo.nombre}</span>
                        {activa && selectedIds.size === 0 && (isAdmin || isEjecutivo) && (
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span role="button" title="Renombrar" className="opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setFolderDialog({ open: true, mode: 'rename', folderId: fo.id, nombre: fo.nombre }); }}><Pencil className="h-3 w-3" /></span>
                            <span role="button" title="Dejar como plantilla" className="opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setFolderDialog({ open: true, mode: 'template', folderId: fo.id, nombre: fo.nombre }); }}><Copy className="h-3 w-3" /></span>
                            <span role="button" title="Eliminar carpeta" className="opacity-80 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setFolderDialog({ open: true, mode: 'delete', folderId: fo.id, nombre: fo.nombre }); }}><Trash2 className="h-3 w-3" /></span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn('h-1.5 flex-1 rounded-full overflow-hidden', activa ? 'bg-white/25' : 'bg-muted-foreground/15')}>
                          <span className={cn('block h-full rounded-full transition-all', activa ? 'bg-white' : 'bg-teal-500')}
                            style={{ width: total > 0 ? `${Math.round((listas / total) * 100)}%` : '0%' }} />
                        </span>
                        <span className={cn('text-[10px] font-semibold shrink-0', activa ? 'text-white/85' : 'text-muted-foreground')}>{listas}/{total}</span>
                      </div>
                    </button>
                  );
                })}
                {isDraggingFolder && (isAdmin || isEjecutivo) && (
                  <button
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverFolder('__root__'); }}
                    onDragLeave={() => setDragOverFolder((p) => (p === '__root__' ? null : p))}
                    onDrop={(e) => { e.preventDefault(); if (dragFolderId.current) nestFolder(dragFolderId.current, null); }}
                    className={cn('w-[210px] rounded-lg border border-dashed border-teal-400 p-2.5 text-xs text-teal-600 flex items-center justify-center',
                      dragOverFolder === '__root__' && 'ring-2 ring-teal-500 scale-[1.03]')}
                    title="Soltar aquí para sacarla al nivel principal"
                  >
                    ⬆ Nivel principal
                  </button>
                )}
                {(selectedIds.size > 0 || isDraggingTask) && (isAdmin || isEjecutivo) && (
                  <button
                    onClick={() => onFolderChipClick(null)}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverFolder('__none__'); }}
                    onDragLeave={() => setDragOverFolder((p) => (p === '__none__' ? null : p))}
                    onDrop={(e) => { e.preventDefault(); dropOnFolder(null); }}
                    className={cn('w-[210px] rounded-lg border border-dashed border-border p-2.5 text-xs text-muted-foreground hover:bg-muted flex items-center justify-center',
                      dragOverFolder === '__none__' && 'ring-2 ring-slate-400 scale-[1.03]')}
                    title="Quitar de su carpeta"
                  >
                    Sin carpeta
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tasks Table */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-0">
          {/* Column visibility toolbar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
            <span className="text-xs text-muted-foreground">{filteredTasks.length} tarea{filteredTasks.length !== 1 ? 's' : ''}</span>
            <div className="relative">
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setShowColumnsMenu(v => !v)}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Columnas
              </Button>
              {showColumnsMenu && (
                <div className="absolute right-0 sm:right-0 top-8 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[180px] max-w-[calc(100vw-2rem)]">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Mostrar columnas</p>
                  <div className="space-y-1">
                    {ALL_COLUMNS.map(col => (
                      <label key={col.key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox
                          checked={visibleCols[col.key]}
                          onCheckedChange={() => toggleCol(col.key)}
                          className="h-3.5 w-3.5"
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs" onClick={() => setShowColumnsMenu(false)}>
                    Cerrar
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="overflow-x-auto -mx-px">
            <Table className="w-full [&_th]:px-1.5 [&_td]:px-1.5">
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="w-8 px-0.5" title="Expandir subtareas"></TableHead>
                  <TableHead className="w-10 px-1 text-center hidden md:table-cell">
                    <Checkbox
                      checked={filteredTasks.length > 0 && selectedIds.size === filteredTasks.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Seleccionar todas"
                      className="h-4 w-4"
                    />
                  </TableHead>
                  <TableHead className="w-7 px-0.5 hidden md:table-cell" title="Favorito"></TableHead>
                  <TableHead className="w-full min-w-[160px]">Tarea</TableHead>
                  {visibleCols.marca && <TableHead className="whitespace-nowrap hidden md:table-cell">Marca</TableHead>}
                  {visibleCols.mesa && <TableHead className="whitespace-nowrap hidden md:table-cell">Mesa</TableHead>}
                  {visibleCols.depto && <TableHead className="whitespace-nowrap hidden md:table-cell">Depto</TableHead>}
                  {visibleCols.responsable && <TableHead className="whitespace-nowrap hidden md:table-cell">Responsable</TableHead>}
                  {visibleCols.entregables && <TableHead className="text-center whitespace-nowrap px-1 w-12 hidden md:table-cell">Entr.</TableHead>}
                  {visibleCols.timer && <TableHead className="whitespace-nowrap px-2">Timer</TableHead>}
                  {visibleCols.archivos && <TableHead className="whitespace-nowrap px-1 w-10 text-center hidden md:table-cell">Arch.</TableHead>}
                  {visibleCols.tipo && <TableHead className="whitespace-nowrap hidden md:table-cell">Tipo</TableHead>}
                  {visibleCols.prioridad && <TableHead className="whitespace-nowrap px-2 hidden md:table-cell">Prioridad</TableHead>}
                  {visibleCols.estado && <TableHead className="whitespace-nowrap px-2">Estado</TableHead>}
                  {visibleCols.entrega && <TableHead className="whitespace-nowrap px-2 hidden md:table-cell">Entrega</TableHead>}
                  {visibleCols.dias && <TableHead className="whitespace-nowrap px-2 hidden md:table-cell">Días</TableHead>}
                  {visibleCols.enlace && <TableHead className="w-10 hidden md:table-cell">Enlace</TableHead>}
                  {visibleCols.autor && <TableHead className="whitespace-nowrap hidden md:table-cell">Autor</TableHead>}
                  {visibleCols.creado && <TableHead className="w-20 hidden md:table-cell">Creado</TableHead>}
                  <TableHead className="w-24 hidden md:table-cell">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={30} className="text-center py-8 text-muted-foreground">
                      No se encontraron tareas
                    </TableCell>
                  </TableRow>
                ) : (
                  Object.entries(groupedTasks).map(([groupKey, tasksInGroup]) => (
                    <React.Fragment key={groupKey}>
                      {/* Group header - Monday style colored bar */}
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell colSpan={30} className="p-0 pt-2">
                          <button
                            onClick={() => toggleGroup(groupKey)}
                            className={cn(
                              "flex items-center gap-2 w-full px-3 py-2 rounded-t-md text-white text-sm font-semibold",
                              groupBy === 'mes' ? getMonthHeaderColor(groupKey) : groupBy === 'departamento' ? (groupKey === 'Por clasificar' ? 'bg-slate-400' : getDepartmentColor(groupKey)) : groupBy === 'responsable' ? (groupKey === 'Sin asignar' ? 'bg-slate-400' : getMonthHeaderColor(groupKey)) : groupBy === 'carpeta' ? (groupKey === 'Sin carpeta' ? 'bg-slate-400' : 'bg-teal-600') : groupBy === 'mes_carpeta' ? getMonthHeaderColor(groupKey.split('\u0007')[0]) : getStatusHeaderColor(groupKey)
                            )}
                          >
                            {collapsedGroups[groupKey] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            {getGroupLabel(groupKey)}
                            <span className="ml-1 opacity-90 font-normal">({tasksInGroup.length})</span>
                            <span className="ml-auto hidden sm:flex items-center gap-2 pr-1">
                              {groupBy === 'carpeta' && groupKey !== 'Sin carpeta' && (isAdmin || isEjecutivo) && (() => {
                                const fo = folders.find((x) => x.nombre === groupKey);
                                if (!fo) return null;
                                const stop = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); };
                                return (
                                  <span className="flex items-center gap-1.5 mr-1">
                                    <span role="button" title="Renombrar carpeta" className="opacity-70 hover:opacity-100 cursor-pointer"
                                      onClick={(e) => { stop(e); setFolderDialog({ open: true, mode: 'rename', folderId: fo.id, nombre: fo.nombre }); }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </span>
                                    <span role="button" title="Dejar como plantilla (módulo Plantillas)" className="opacity-70 hover:opacity-100 cursor-pointer"
                                      onClick={(e) => { stop(e); setFolderDialog({ open: true, mode: 'template', folderId: fo.id, nombre: fo.nombre }); }}>
                                      <Copy className="h-3.5 w-3.5" />
                                    </span>
                                    <span role="button" title="Eliminar carpeta (las tareas quedan sin carpeta)" className="opacity-70 hover:opacity-100 cursor-pointer"
                                      onClick={(e) => { stop(e); setFolderDialog({ open: true, mode: 'delete', folderId: fo.id, nombre: fo.nombre }); }}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </span>
                                  </span>
                                );
                              })()}
                              <span className="text-[11px] font-normal opacity-90">{tasksInGroup.filter((t) => ['aprobado', 'entregado'].includes(t.estado)).length}/{tasksInGroup.length} listas</span>
                              {groupBy !== 'estado' && (
                                <span className="flex h-1.5 w-28 rounded-full overflow-hidden bg-white/25">
                                  {statusOrder.map((st) => { const n = tasksInGroup.filter((t) => t.estado === st).length; return n > 0 ? <span key={st} className={cn('h-full', getStatusHeaderColor(st))} style={{ width: `${(n / tasksInGroup.length) * 100}%` }} /> : null; })}
                                </span>
                              )}
                            </span>
                          </button>
                        </TableCell>
                      </TableRow>
                      {/* Group rows */}
                      {!collapsedGroups[groupKey] && tasksInGroup.map((task) => (
                        <FilaTarea
                          key={task.id}
                          task={task}
                          columnas={visibleCols}
                          seleccionada={selectedIds.has(task.id)}
                          expandida={expandedTaskIds.has(task.id)}
                          eliminando={deleteTaskId === task.id}
                          arrastrable={filasArrastrables}
                          puedeEditar={canEditTask(task)}
                          puedeOperar={canOperateTask(task)}
                          puedeEliminar={canDeleteTasks}
                          asignada={isAssignedTo(task)}
                          usuarios={users}
                          todasLasTareas={tasks}
                          acciones={accionesFila}
                        />
                      ))}
                      {!collapsedGroups[groupKey] && (isAdmin || isEjecutivo || isEquipo) && (
                        <TableRow className="border-border bg-muted/20">
                          <TableCell colSpan={30} className="py-1.5">
                            {quickAddGroup === groupKey ? (
                              <div className="flex flex-wrap items-center gap-2 pl-8">
                                <Input autoFocus value={qaTitle} onChange={(e) => setQaTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') quickAddTask(groupKey, tasksInGroup); if (e.key === 'Escape') setQuickAddGroup(null); }} placeholder="Título de la tarea…" className="h-8 w-64 text-sm" />
                                <Select value={qaBrand} onValueChange={setQaBrand}>
                                  <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Marca *" /></SelectTrigger>
                                  <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}</SelectContent>
                                </Select>
                                <Input type="date" value={qaFecha} onChange={(e) => setQaFecha(e.target.value)} className="h-8 w-36 text-xs" title="Fecha de entrega (vacía = en 7 días)" />
                                <Button size="sm" className="h-8" disabled={qaSaving || !qaTitle.trim() || !qaBrand} onClick={() => quickAddTask(groupKey, tasksInGroup)}>{qaSaving ? '…' : 'Agregar'}</Button>
                                <Button size="sm" variant="ghost" className="h-8" onClick={() => setQuickAddGroup(null)}>Cancelar</Button>
                              </div>
                            ) : (
                              <button onClick={() => { setQuickAddGroup(groupKey); setQaTitle(''); }} className="flex items-center gap-2 pl-8 text-sm text-muted-foreground hover:text-primary transition-colors">
                                <Plus className="h-3.5 w-3.5" />Agregar aquí
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))
                )}
                {(isAdmin || isEjecutivo || isEquipo) && (
                  <TableRow
                    className="border-border hover:bg-muted/50 cursor-pointer group"
                    onClick={abrirNuevaTarea}
                  >
                    <TableCell colSpan={30} className="py-2 text-muted-foreground text-sm">
                      <div className="flex items-center gap-2 group-hover:text-primary transition-colors">
                        <Plus className="h-4 w-4" />
                        <span>Agregar tarea</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {totalTasks > pageSize && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-3 py-3 border-t bg-muted/30 sticky bottom-0">
                <p className="text-xs sm:text-sm font-medium order-2 sm:order-1">
                  📄 Mostrando {Math.min(pageSize, totalTasks - page * pageSize)} de {totalTasks} tareas — Página {page + 1} de {Math.max(1, Math.ceil(totalTasks / pageSize))}
                </p>
                <div className="flex gap-2 order-1 sm:order-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0 || loading}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(totalTasks / pageSize) - 1 || loading}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Task Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedTask?.titulo_tarea || 'Detalle de Tarea'}</DialogTitle>
            <DialogDescription>Información completa, timer, comentarios y entregables.</DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-5">
              {/* Header badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={getPriorityColor(selectedTask.prioridad)}>
                  {selectedTask.prioridad.toUpperCase()}
                </Badge>
                <Badge className={getStatusColor(selectedTask.estado)}>
                  {getStatusLabel(selectedTask.estado)}
                </Badge>
                {selectedTask.task_type && (
                  <Badge variant="outline">{selectedTask.task_type.nombre}</Badge>
                )}
                {selectedTask.deliverable_type && (
                  <Badge variant="outline" className="text-xs">{selectedTask.deliverable_type.nombre}</Badge>
                )}
                {selectedTask.sprint && (
                  <Badge variant="outline" className="text-xs">{selectedTask.sprint.name}</Badge>
                )}
                {selectedTask.department_nombre && (
                  <DepartmentBadge nombre={selectedTask.department_nombre} color={selectedTask.department_color} />
                )}
                {canEditTask(selectedTask) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 gap-1.5 text-xs"
                    onClick={() => setHandoffOpen(true)}
                  >
                    <Workflow className="h-3.5 w-3.5" />
                    Pasar de etapa
                  </Button>
                )}
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column — info */}
                <div className="space-y-5">
                  {/* Metadata grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm p-4 rounded-lg border border-border bg-muted/20">
                    <div>
                      <span className="text-muted-foreground text-xs block">Marca</span>
                      <span className="font-medium">{selectedTask.brands?.nombre || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Mesa</span>
                      <span className="font-medium">{selectedTask.desks?.nombre || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Fecha Inicio</span>
                      <span className="font-medium">
                        {selectedTask.fecha_inicio ? parseLocalDate(selectedTask.fecha_inicio).toLocaleDateString('es-ES') : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Fecha Entrega</span>
                      <span className="font-medium">
                        {selectedTask.fecha_entrega ? parseLocalDate(selectedTask.fecha_entrega).toLocaleDateString('es-ES') : <span className="text-muted-foreground italic">Sin fecha</span>}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Entregables</span>
                      <span className="font-medium">{selectedTask.cantidad_entregables}</span>
                    </div>
                    {selectedTask.story_points != null && (
                      <div>
                        <span className="text-muted-foreground text-xs block">Story Points</span>
                        <span className="font-medium">{selectedTask.story_points}</span>
                      </div>
                    )}
                    {selectedTask.feature && (
                      <div>
                        <span className="text-muted-foreground text-xs block">Feature</span>
                        <span className="font-medium">{selectedTask.feature.name}</span>
                      </div>
                    )}
                    {selectedTask.deliverable_type && (
                      <div>
                        <span className="text-muted-foreground text-xs block">Tipo Entregable</span>
                        <span className="font-medium">{selectedTask.deliverable_type.nombre}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground text-xs block">Autor</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Avatar className="h-5 w-5">
                          {selectedTask.created_by_profile?.avatar_url ? (
                            <AvatarImage src={selectedTask.created_by_profile.avatar_url} alt={selectedTask.created_by_profile.nombre} className="object-cover" />
                          ) : null}
                          <AvatarFallback className="bg-primary/20 text-primary text-[8px] font-semibold">
                            {getInitials(selectedTask.created_by_profile?.nombre || '?')}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{selectedTask.created_by_profile?.nombre || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Timer Section */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Tiempo Trabajado</h4>
                    <TaskTimer
                      taskId={selectedTask.id}
                      initialTime={selectedTask.tiempo_trabajado}
                      isActive={selectedTask.timer_activo}
                      startTime={selectedTask.timer_inicio}
                      canEdit={canOperateTask(selectedTask)}
                      estimatedHours={selectedTask.estimated_hours}
                      warnEnabled={isAssignedTo(selectedTask)}
                      taskTitle={selectedTask.titulo_tarea}
                      onUpdate={() => { fetchData(); reloadSelectedTask(); }}
                    />
                  </div>

                  {/* C) Cambios / vueltas: internos vs cliente */}
                  {((selectedTask.cambios_cliente ?? 0) + (selectedTask.cambios_internos ?? 0)) > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Cambios / vueltas</h4>
                      <div className="flex items-center gap-1.5 flex-wrap text-sm">
                        <RotateCcw className="h-4 w-4 text-amber-500" />
                        <span className="font-medium">{(selectedTask.cambios_cliente ?? 0) + (selectedTask.cambios_internos ?? 0)}</span>
                        <span className="text-xs text-muted-foreground">
                          ({selectedTask.cambios_internos ?? 0} internos · {selectedTask.cambios_cliente ?? 0} del cliente)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* E) Tiempo por persona */}
                  {selectedTask.tiempo_por_persona && selectedTask.tiempo_por_persona.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Tiempo por persona</h4>
                      <div className="space-y-1.5">
                        {selectedTask.tiempo_por_persona.map((p) => (
                          <div key={p.user_id} className="flex items-center gap-2 text-sm">
                            <Avatar className="h-6 w-6">
                              {p.avatar_url ? <AvatarImage src={p.avatar_url} alt={p.nombre} className="object-cover" /> : null}
                              <AvatarFallback className="bg-primary/20 text-primary text-[9px] font-semibold">{getInitials(p.nombre || '?')}</AvatarFallback>
                            </Avatar>
                            <span className="flex-1 truncate">{p.nombre || '—'}</span>
                            <span className="font-mono text-muted-foreground">{formatTimeDisplay(p.segundos)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* E2) Historial: sesiones de tiempo y cambios (pedido de Steven) */}
                  <TaskHistorial taskId={selectedTask.id} ajustes={Number((selectedTask as { ajustes_count?: number }).ajustes_count ?? 0)} />

                  {/* B) Seguidores */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><Users className="h-4 w-4" />Seguidores</h4>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={toggleSeguirTarea}>
                        {selectedTask.me_sigue ? <><EyeOff className="h-3.5 w-3.5" />Dejar de seguir</> : <><Eye className="h-3.5 w-3.5" />Seguir</>}
                      </Button>
                    </div>
                    {selectedTask.seguidores && selectedTask.seguidores.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedTask.seguidores.map((sg) => (
                          <span key={sg.user_id} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
                            <Avatar className="h-4 w-4">
                              {sg.avatar_url ? <AvatarImage src={sg.avatar_url} alt={sg.nombre} className="object-cover" /> : null}
                              <AvatarFallback className="bg-primary/20 text-primary text-[7px] font-semibold">{getInitials(sg.nombre || '?')}</AvatarFallback>
                            </Avatar>
                            {sg.nombre}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Nadie sigue esta tarea todavía. Quien la pasa de etapa la sigue automáticamente.</p>
                    )}
                  </div>

                  {/* Responsable Section */}
                  {((selectedTask.responsables && selectedTask.responsables.length > 0) || selectedTask.responsable_user_id) && (
                    <div className="p-4 rounded-lg border border-border bg-muted/30">
                      <h4 className="text-sm font-medium text-muted-foreground mb-3">Responsable{(selectedTask.responsables?.length || 0) > 1 ? 's' : ''}</h4>
                      <div className="space-y-2">
                        {(selectedTask.responsables && selectedTask.responsables.length > 0) ? (
                          selectedTask.responsables.map((r) => (
                            <ResponsableMetrics
                              key={r.user_id}
                              userId={r.user_id}
                              userName={r.nombre || 'Sin nombre'}
                              avatarUrl={r.avatar_url}
                              allTasks={tasks}
                            />
                          ))
                        ) : (
                          <ResponsableMetrics
                            userId={selectedTask.responsable_user_id!}
                            userName={users.find(u => u.id === selectedTask.responsable_user_id)?.nombre || 'Sin asignar'}
                            avatarUrl={users.find(u => u.id === selectedTask.responsable_user_id)?.avatar_url}
                            allTasks={tasks}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Deliverable Progress */}
                  <DeliverableProgress
                    taskId={selectedTask.id}
                    expectedCount={selectedTask.cantidad_entregables}
                  />

                  {/* Visto por */}
                  {taskReads.length > 0 && (
                    <div className="p-4 rounded-lg border border-border bg-muted/20">
                      <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Eye className="h-4 w-4" />
                        Visto por ({taskReads.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {taskReads.map((reader) => (
                          <div key={reader.user_id} className="flex items-center gap-1.5 bg-muted/40 rounded-md px-2 py-1">
                            <Avatar className="h-6 w-6">
                              {reader.avatar_url ? (
                                <AvatarImage src={reader.avatar_url} alt={reader.nombre} className="object-cover" />
                              ) : null}
                              <AvatarFallback className="bg-primary/20 text-primary text-[8px] font-semibold">
                                {getInitials(reader.nombre || '?')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span className="text-xs font-medium">{reader.nombre}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(reader.read_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTask.enlaces && selectedTask.enlaces.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Enlaces</h4>
                      <div className="space-y-1">
                        {selectedTask.enlaces.map((link, i) => (
                          <a
                            key={i}
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-sm text-primary hover:underline truncate"
                          >
                            {link}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Right column — status, files, comments, calendar */}
                <div className="space-y-5">
                  {/* Detalle arriba (Steven): es lo primero que el equipo necesita leer */}
                  {selectedTask.detalle && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Detalle</h4>
                      <div className="bg-muted/30 p-3 rounded-lg border border-border/50 max-h-72 overflow-y-auto">
                        <RichTextViewer content={selectedTask.detalle} />
                      </div>
                    </div>
                  )}
                  {canOperateTask(selectedTask) && (
                    <div className="pb-4 border-b border-border">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Cambiar Estado</h4>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/tareas?task=${selectedTask.id}`); toast.success('Link de la tarea copiado'); }} title="Copiar link a esta tarea">
                          <Link2 className="h-3.5 w-3.5" />Copiar link
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['backlog', 'en_proceso', 'revision_interna', 'revision_cliente', 'entregado', 'bloqueado'].map((status) => (
                          <Button
                            key={status}
                            variant={selectedTask.estado === status ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              updateTaskStatus(selectedTask.id, status as Task['estado']);
                              setSelectedTask({ ...selectedTask, estado: status as Task['estado'] });
                            }}
                          >
                            {getStatusLabel(status)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Files Section */}
                  <TaskFiles
                    taskId={selectedTask.id}
                    canEdit={canEditTask(selectedTask)}
                  />

                  {/* Comentarios (realtime) */}
                  <CommentsPanel taskId={selectedTask.id} deskId={selectedTask.desk_id || undefined} />

                  {/* Google Calendar Sync */}
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        Google Calendar
                      </h4>
                      {selectedTask.google_event_id ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs text-green-600 border-green-300">Sincronizado</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={async () => {
                              try {
                                await api.syncTaskToGoogleCalendar(selectedTask.id);
                                toast.success('Evento actualizado en Google Calendar');
                              } catch { toast.error('Error al actualizar evento'); }
                            }}
                          >
                            Actualizar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive"
                            onClick={async () => {
                              try {
                                await api.unsyncTaskFromGoogleCalendar(selectedTask.id);
                                setSelectedTask({ ...selectedTask, google_event_id: null });
                                toast.success('Evento eliminado de Google Calendar');
                              } catch { toast.error('Error al eliminar evento'); }
                            }}
                          >
                            Desvincular
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={async () => {
                            try {
                              const result = await api.syncTaskToGoogleCalendar(selectedTask.id);
                              setSelectedTask({ ...selectedTask, google_event_id: result.google_event_id });
                              toast.success('Tarea sincronizada con Google Calendar');
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Error al sincronizar');
                            }
                          }}
                        >
                          <Calendar className="h-3 w-3" />
                          Sincronizar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Formulario de tarea (crear / editar), compartido con Minutas */}
      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tarea={tareaEditando}
        mesaPorDefecto={filterDesk !== 'all' ? filterDesk : (pinnedDeskId || '')}
        puedeEditarArchivos={tareaEditando ? canEditTask(tareaEditando) : true}
        onGuardada={() => fetchData()}
      />

      {/* Bulk Actions bar — aparece al seleccionar tareas */}
      <HandoffDialog
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        task={selectedTask as any}
        users={users}
        onDone={() => { fetchData(); setDetailDialogOpen(false); }}
      />
      {/* Diálogo de carpetas: crear / renombrar / plantilla / eliminar */}
      <Dialog open={!!folderDialog?.open} onOpenChange={(o) => { if (!o) setFolderDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {folderDialog?.mode === 'create' && '📁 Nueva carpeta'}
              {folderDialog?.mode === 'rename' && '📁 Renombrar carpeta'}
              {folderDialog?.mode === 'template' && '📋 Dejar como plantilla'}
              {folderDialog?.mode === 'delete' && '🗑️ Eliminar carpeta'}
            </DialogTitle>
            <DialogDescription>
              {folderDialog?.mode === 'create' && 'Agrupa las tareas de esta mesa, por ejemplo "Cronograma Septiembre". Luego selecciona tareas y muévelas con un clic.'}
              {folderDialog?.mode === 'rename' && 'El nuevo nombre se refleja en todas las tareas de la carpeta.'}
              {folderDialog?.mode === 'template' && 'Crea una plantilla en el módulo Plantillas con las tareas de esta carpeta y sus fechas relativas, lista para reusar el próximo mes.'}
              {folderDialog?.mode === 'delete' && `Las tareas NO se borran: solo quedan sin carpeta.`}
            </DialogDescription>
          </DialogHeader>
          {folderDialog && folderDialog.mode !== 'delete' && (
            <div className="space-y-1.5">
              <Label className="text-xs">{folderDialog.mode === 'template' ? 'Nombre de la plantilla' : 'Nombre de la carpeta'}</Label>
              <Input
                autoFocus
                value={folderDialog.nombre}
                onChange={(e) => setFolderDialog((d) => (d ? { ...d, nombre: e.target.value } : d))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitFolderDialog(); }}
                placeholder={folderDialog.mode === 'create' ? 'ej. Cronograma Septiembre' : ''}
                maxLength={160}
              />
            </div>
          )}
          {folderDialog?.mode === 'delete' && (
            <p className="text-sm text-foreground">¿Eliminar la carpeta <strong>"{folderDialog.nombre}"</strong>?</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(null)} disabled={folderSaving}>Cancelar</Button>
            <Button
              variant={folderDialog?.mode === 'delete' ? 'destructive' : 'default'}
              onClick={submitFolderDialog}
              disabled={folderSaving}
            >
              {folderSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {folderDialog?.mode === 'create' && 'Crear'}
              {folderDialog?.mode === 'rename' && 'Guardar'}
              {folderDialog?.mode === 'template' && 'Crear plantilla'}
              {folderDialog?.mode === 'delete' && 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkActions
        selectedIds={selectedIds}
        onClear={() => setSelectedIds(new Set())}
        onComplete={() => { setSelectedIds(new Set()); fetchData(); if (activeDeskId) reloadFolders(activeDeskId); }}
        users={users}
        folders={folders}
        onEditOne={(id) => { const t = tasks.find((x) => x.id === id); if (t) openEditDialog(t); }}
        onOpenOne={(id) => { const t = tasks.find((x) => x.id === id); if (t) { setSelectedTask(t); setDetailDialogOpen(true); } }}
      />
    </div>
  );
}
