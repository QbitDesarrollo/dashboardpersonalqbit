import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import type { Project, ProjectTask } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, getInitials } from '@/lib/utils';
import { ESTADO_LABEL, fmt, ProgressBar, SALUD_DOT, SALUD_LABEL } from './comun';
import { ReportesProyecto } from './ReportesProyecto';
import { SelectorLider } from './SelectorLider';

interface Props {
  project: Project;
  personas: { id: string; nombre: string }[];
  onBack: () => void;
  /** Report to open right away (link from the "your report is ready" email). */
  reporteInicial?: string;
}

const STATUS_ORDER = ['backlog', 'en_proceso', 'en_revision', 'revision_interna', 'revision_cliente', 'aprobado', 'entregado', 'bloqueado'];
const STATUS_LABEL: Record<string, string> = { backlog: 'Pendiente', en_proceso: 'En proceso', en_revision: 'En revisión', revision_interna: 'Revisión interna', revision_cliente: 'Revisión cliente', aprobado: 'Aprobado', entregado: 'Entregado', bloqueado: 'Bloqueado' };

/** One project: progress, leader, weekly reports and its tasks by status. */
export function DetalleProyecto({ project, personas, onBack, reporteInicial }: Props) {
  const { profile, isAdmin, isEjecutivo } = useAuth();
  const [data, setData] = useState<{ project: Project; tasks: ProjectTask[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cambiandoLider, setCambiandoLider] = useState(false);
  const load = async () => { try { setLoading(true); setData(await api.getProject(project.id)); } catch { toast.error('Error'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [project.id]);

  const setEstado = async (estado: string) => { try { await api.patchProject(project.id, { estado }); load(); toast.success('Estado actualizado'); } catch { toast.error('Error'); } };
  const setLider = async (lider_user_id: string) => {
    try {
      const p = await api.patchProject(project.id, { lider_user_id });
      setData((d) => (d ? { ...d, project: p } : d));
      setCambiandoLider(false);
      toast.success('Líder actualizado');
    } catch { toast.error('No se pudo cambiar el líder'); }
  };

  if (loading || !data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const p = data.project;
  const puedeEditarLider = isAdmin || isEjecutivo;
  // A deactivated leader counts as no leader: reports pause until someone assigns another.
  const liderActivo = !!p.lider_user_id && p.lider_activo !== false;
  const veReportes = liderActivo && (isAdmin || profile?.id === p.lider_user_id);

  const grouped: Record<string, ProjectTask[]> = {};
  for (const t of data.tasks) (grouped[t.estado] ||= []).push(t);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Volver a proyectos"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2"><span className={cn('inline-block h-3 w-3 rounded-full', SALUD_DOT[p.salud])} />{p.nombre}</h1>
          <p className="text-sm text-muted-foreground">{p.brand_nombre}</p>
        </div>
        <Select value={p.estado} onValueChange={setEstado}><SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ESTADO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      </div>

      {!liderActivo && (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {p.lider_user_id
            ? 'El líder de este proyecto está desactivado. Asigna otro para seguir con sus reportes.'
            : 'Este proyecto no tiene líder. Asígnalo para activar sus reportes semanales.'}
        </p>
      )}

      <Card><CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Avance</div><div className="text-xl font-bold">{p.avance}%</div></div>
          <div><div className="text-xs text-muted-foreground">Tareas</div><div className="text-xl font-bold">{p.tareas_listas}/{p.total_tareas}</div></div>
          <div><div className="text-xs text-muted-foreground">Salud</div><div className="text-xl font-bold flex items-center gap-1.5"><span className={cn('inline-block h-3 w-3 rounded-full', SALUD_DOT[p.salud])} />{SALUD_LABEL[p.salud]}</div></div>
          <div><div className="text-xs text-muted-foreground">Entrega objetivo</div><div className="text-lg font-semibold">{fmt(p.fecha_fin)}</div></div>
        </div>
        <ProgressBar pct={p.avance} salud={p.salud} />
        {liderActivo && !cambiandoLider && (
          <div className="flex items-center gap-2 pt-1 text-sm">
            <span className="text-muted-foreground">Líder: {p.lider_nombre}</span>
            {puedeEditarLider && (
              <Button variant="link" size="sm" className="h-auto px-0" aria-label="Cambiar líder" onClick={() => setCambiandoLider(true)}>Cambiar</Button>
            )}
          </div>
        )}
        {puedeEditarLider && (!liderActivo || cambiandoLider) && (
          <div className="max-w-xs space-y-1.5 pt-1">
            <Label htmlFor="dp-lider" className="text-xs">Líder del proyecto</Label>
            <SelectorLider id="dp-lider" personas={personas} value={liderActivo ? p.lider_user_id! : ''} onChange={setLider} />
          </div>
        )}
      </CardContent></Card>

      {veReportes && <ReportesProyecto proyectoId={p.id} personas={personas} reporteInicial={reporteInicial} />}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Tareas del proyecto</h2>
          <Button variant="outline" size="sm" asChild><Link to={`/tareas?project=${p.id}`}><Link2 className="h-4 w-4" />Ver en Tareas</Link></Button>
        </div>
        {data.tasks.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sin tareas en este proyecto todavía. Asígnalas desde la vista de Tareas o el detalle de cada tarea.</CardContent></Card>
          : STATUS_ORDER.filter((st) => grouped[st]?.length).map((st) => (
            <div key={st} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><span>{STATUS_LABEL[st]}</span><Badge variant="secondary" className="text-[10px]">{grouped[st].length}</Badge></div>
              <Card><CardContent className="p-0"><div className="divide-y">
                {grouped[st].map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="font-medium text-sm">{t.titulo_tarea}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {t.fecha_entrega && <span className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmt(t.fecha_entrega)}</span>}
                      {t.responsable_nombre && <Avatar className="h-6 w-6">{t.responsable_avatar && <AvatarImage src={t.responsable_avatar} />}<AvatarFallback className="text-[9px]">{getInitials(t.responsable_nombre)}</AvatarFallback></Avatar>}
                    </div>
                  </div>
                ))}
              </div></CardContent></Card>
            </div>
          ))}
      </div>
    </div>
  );
}
