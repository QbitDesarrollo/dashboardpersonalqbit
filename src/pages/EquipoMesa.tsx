import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';
import {
  AlertTriangle, Box, CheckCircle2, Clock, ExternalLink, Flame, Grid3x3, Loader2, Lock, Pause, Play,
  RefreshCw, RotateCcw, Settings2, TrendingUp, Users, Utensils, Wrench,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';

// ---------- Tipos (espejo de GET /api/data/dev-team/overview) ----------
interface Semana { inicio: string; horas: number; tareas: number; capacidad: number; pct: number }
interface Miembro {
  id: string; nombre: string; email: string; rol: string; avatar_url?: string | null; activo: boolean;
  capacidad_semana: number; reservadas_semana: number; capacidad_proyectos: number; reservadas_sugeridas: number;
  recurrente: { horas_8sem: number; tareas_timer_8sem: number; tareas_entregadas_8sem: number };
  presencia: 'online' | 'away' | 'offline';
  asistencia_hoy: { check_in: string; check_out: string | null; lunch_start: string | null; lunch_end: string | null } | null;
  timer: { task_id: string; titulo: string; status: 'active' | 'paused'; start_time: string; segundos: number } | null;
  /** Timer pausado solo porque Tiusdei estuvo cerrado o la pestaña se durmió */
  autopausa?: { titulo: string; end_time: string } | null;
  es_soporte?: boolean;
  primer_ingreso?: string | null;
  ingreso_tarde?: boolean;
  calendario_conectado?: boolean;
  reunion_ahora?: { summary: string; start: string; end: string; duration_min: number } | null;
  reuniones_hoy?: number;
  asistencia_hoy_seg?: number;
  utilizacion_hoy_pct?: number | null;
  horas: { hoy: number; timer_hoy?: number; reuniones_hoy?: number; reuniones_hoy_total?: number; reuniones_semana?: number; reuniones_ult30?: number; semana: number; ult7: number; ult30: number; ritmo_semanal: number; por_semana: { inicio: string; horas: number }[] };
  entregas: { por_semana: { inicio: string; entregas: number }[]; ult30: number };
  conteos: {
    total: number; abiertas: number; por_estado: Record<string, number>; vencidas: number; vence_esta_semana: number;
    vence_proxima_semana: number; sin_fecha: number; sin_estimar: number; bloqueadas: number; en_proceso: number;
    reagendadas: number; con_ajustes: number; alta_prioridad: number;
  };
  carga: {
    horas_comprometidas: number; horas_defecto_por_tarea: number; semanas_para_vaciar: number | null; semanas_a_ritmo_real: number | null;
    vencidas: { horas: number; tareas: number }; bloqueadas?: { horas: number; tareas: number; dias_max: number; dias_promedio: number }; sin_fecha: { horas: number; tareas: number }; despues: { horas: number; tareas: number };
    semanas: Semana[];
  };
}
interface Tarea {
  id: string; titulo: string; estado: string; prioridad: string; fecha_inicio: string | null; fecha_entrega: string | null;
  estimado_h: number | null; estimado_tipo_h?: number | null; trabajado_h: number; responsable_user_id: string | null; responsables: string[]; miembros: string[];
  ajustes: number; reagendada: number; es_subtarea: boolean; timer_activo: boolean; departamento: string | null;
  project_id: string | null; proyecto: string | null; marca: string | null; mesa: string | null; abierta: boolean; vencida: boolean; bloqueada?: boolean; bloqueada_dias?: number | null;
  created_at: string; updated_at: string;
}
interface Proyecto {
  id: string; nombre: string; marca: string | null; estado: string; salud: string | null; fecha_fin: string | null;
  total: number; abiertas: number; vencidas: number; horas_restantes: number; por_miembro: Record<string, number>;
}
interface Overview {
  generado: string; hoy: string; semana_actual: string; hora_limite_ingreso?: string; miembros: Miembro[];
  equipo: {
    integrantes?: number; soporte?: number; capacidad_semana: number; capacidad_bruta: number; reservadas_semana: number; horas_comprometidas: number; ritmo_semanal_real: number; semanas_para_vaciar: number | null;
    semanas_a_ritmo_real: number | null; horas_faltantes_semana: number; personas_faltantes: number; tareas_abiertas: number;
    sin_estimar: number; pct_sin_estimar: number; bloqueadas?: { tareas: number; horas: number }; saturados: string[]; veredicto: 'ok' | 'al_limite' | 'contratar';
  };
  proyectos: Proyecto[]; tareas: Tarea[];
  candidatos: { id: string; nombre: string; rol: string; avatar_url?: string | null }[];
  config: { member_ids: string[] };
}

// ---------- Helpers ----------
const PALETA = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#f97316'];
const TZ = 'America/Guayaquil';
const fmtHora = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '';
const fmtDM = (ymd?: string | null) => ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '—';
const fmtH = (h: number) => (Math.abs(h) >= 10 ? `${Math.round(h)}h` : `${(Math.round(h * 10) / 10).toString().replace('.0', '')}h`);
const fmtDur = (seg: number) => { const h = Math.floor(seg / 3600); const m = Math.floor((seg % 3600) / 60); return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`; };
const colorCarga = (pct: number) => (pct > 100 ? '#f43f5e' : pct > 70 ? '#f59e0b' : '#10b981');
const bgCarga = (pct: number) => (pct > 100 ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300' : pct > 70 ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : pct > 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted/40 text-muted-foreground');
function shade(hex: string, factor: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(factor >= 0 ? v + (255 - v) * factor : v * (1 + factor))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
const ESTADO: Record<string, { label: string; cls: string }> = {
  backlog: { label: 'Backlog', cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  en_proceso: { label: 'En proceso', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  en_revision: { label: 'En revisión', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  revision_interna: { label: 'Rev. interna', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  revision_cliente: { label: 'Rev. cliente', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  ajustes: { label: 'Ajustes', cls: 'bg-orange-500/20 text-orange-700 dark:text-orange-300' },
  aprobado: { label: 'Aprobado', cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' },
  entregado: { label: 'Entregado', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  bloqueado: { label: 'Bloqueado', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
};
const ORDEN_ESTADO = ['bloqueado', 'en_proceso', 'ajustes', 'revision_interna', 'revision_cliente', 'en_revision', 'backlog', 'aprobado', 'entregado'];

// ---------- Vista 3D (proyección isométrica en SVG, sin librerías) ----------
interface Celda { miembro: Miembro; col: number; fila: number; etiqueta: string; horas: number; vencidas: number; tareas: number; capacidad: number | null; pct: number }

function IsoCarga({ miembros, colores, onHover }: { miembros: Miembro[]; colores: Record<string, string>; onHover: (c: Celda | null) => void }) {
  const CW = 44, CD = 44, FOOT = 28, ZMAX = 120;
  const semanas = miembros[0]?.carga.semanas ?? [];
  const columnas = [
    ...semanas.map((s, i) => ({ key: s.inicio, label: `${i === 0 ? 'Esta semana' : `Semana ${i + 1}`} · ${fmtDM(s.inicio)}`, l1: i === 0 ? 'Actual' : `S${i + 1}`, l2: fmtDM(s.inicio) })),
    { key: 'sin_fecha', label: 'Sin fecha', l1: 'Sin', l2: 'fecha' },
    { key: 'despues', label: 'Más de 8 semanas', l1: '+8', l2: 'sem' },
  ];
  const celdas: Celda[] = [];
  miembros.forEach((m, fila) => {
    m.carga.semanas.forEach((s, col) => {
      const venc = col === 0 ? m.carga.vencidas.horas : 0;
      celdas.push({ miembro: m, col, fila, etiqueta: columnas[col].label, horas: s.horas, vencidas: venc, tareas: s.tareas, capacidad: s.capacidad, pct: s.pct });
    });
    celdas.push({ miembro: m, col: semanas.length, fila, etiqueta: 'Sin fecha', horas: m.carga.sin_fecha.horas, vencidas: 0, tareas: m.carga.sin_fecha.tareas, capacidad: null, pct: 0 });
    celdas.push({ miembro: m, col: semanas.length + 1, fila, etiqueta: 'Más de 8 semanas', horas: m.carga.despues.horas, vencidas: 0, tareas: m.carga.despues.tareas, capacidad: null, pct: 0 });
  });
  const maxH = Math.max(1, ...celdas.map((c) => c.horas), ...miembros.map((m) => m.capacidad_semana * 1.15));
  const zs = ZMAX / maxH;
  const nCols = columnas.length, nFilas = miembros.length;
  const P = (x: number, y: number, z: number): [number, number] => [(x - y) * 0.866, (x + y) * 0.5 - z];
  const poly = (pts: [number, number][]) => pts.map((p) => p.join(',')).join(' ');
  const minX = -nFilas * CD * 0.866 - 80, maxX = nCols * CW * 0.866 + 40;
  const minY = -ZMAX - 24, maxY = (nCols * CW + nFilas * CD) * 0.5 + 70;
  const caja = (x0: number, y0: number, z0: number, w: number, d: number, h: number, color: string, key: string) => (
    <g key={key}>
      <polygon points={poly([P(x0, y0 + d, z0), P(x0 + w, y0 + d, z0), P(x0 + w, y0 + d, z0 + h), P(x0, y0 + d, z0 + h)])} fill={shade(color, -0.15)} />
      <polygon points={poly([P(x0 + w, y0, z0), P(x0 + w, y0 + d, z0), P(x0 + w, y0 + d, z0 + h), P(x0 + w, y0, z0 + h)])} fill={shade(color, -0.38)} />
      <polygon points={poly([P(x0, y0, z0 + h), P(x0 + w, y0, z0 + h), P(x0 + w, y0 + d, z0 + h), P(x0, y0 + d, z0 + h)])} fill={shade(color, 0.25)} />
    </g>
  );
  const ordenadas = [...celdas].sort((a, b) => a.col + a.fila - (b.col + b.fila));
  const off = (CW - FOOT) / 2;
  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="w-full h-auto max-h-[460px] select-none" role="img" aria-label="Carga de trabajo en 3D">
      {/* piso */}
      {miembros.map((_, j) => columnas.map((_c, i) => (
        <polygon key={`f${i}-${j}`} points={poly([P(i * CW, j * CD, 0), P((i + 1) * CW, j * CD, 0), P((i + 1) * CW, (j + 1) * CD, 0), P(i * CW, (j + 1) * CD, 0)])}
          fill={i < semanas.length ? 'hsl(var(--muted))' : 'hsl(var(--muted) / 0.4)'} stroke="hsl(var(--border))" strokeWidth={0.6} />
      )))}
      {/* etiquetas de columnas (borde frontal, dos líneas cortas para que no se pisen) */}
      {columnas.map((c, i) => { const [x, y] = P(i * CW + CW / 2, nFilas * CD + 5, 0); return (
        <g key={`cl${i}`} transform={`rotate(30 ${x} ${y})`}>
          <text x={x} y={y} fontSize={9.5} fontWeight={700} fill="hsl(var(--foreground))" textAnchor="middle" dominantBaseline="hanging">{c.l1}</text>
          <text x={x} y={y + 11} fontSize={8.5} fill="hsl(var(--muted-foreground))" textAnchor="middle" dominantBaseline="hanging">{c.l2}</text>
        </g>
      ); })}
      {/* barras, de atrás hacia adelante */}
      {ordenadas.map((c) => {
        const x0 = c.col * CW + off, y0 = c.fila * CD + off;
        const color = c.capacidad == null ? '#64748b' : colorCarga(c.pct);
        const hVenc = c.vencidas * zs, hResto = Math.max(0, c.horas - c.vencidas) * zs;
        const key = `${c.miembro.id}-${c.col}`;
        return (
          <g key={key} onMouseEnter={() => onHover(c)} onMouseLeave={() => onHover(null)} style={{ cursor: 'default' }}>
            <title>{`${c.miembro.nombre} · ${c.etiqueta}: ${fmtH(c.horas)}${c.capacidad != null ? ` de ${c.capacidad}h (${c.pct}%)` : ''} · ${c.tareas} tareas${c.vencidas ? ` · ${fmtH(c.vencidas)} vencidas` : ''}`}</title>
            {c.horas <= 0 && (
              <polygon points={poly([P(x0, y0, 0.5), P(x0 + FOOT, y0, 0.5), P(x0 + FOOT, y0 + FOOT, 0.5), P(x0, y0 + FOOT, 0.5)])} fill="hsl(var(--border))" opacity={0.6} />
            )}
            {hVenc > 0 && caja(x0, y0, 0, FOOT, FOOT, hVenc, '#be123c', `${key}-v`)}
            {hResto > 0 && caja(x0, y0, hVenc, FOOT, FOOT, hResto, color, `${key}-r`)}
            {c.capacidad != null && (
              <polygon points={poly([P(x0 - 3, y0 - 3, c.capacidad * zs), P(x0 + FOOT + 3, y0 - 3, c.capacidad * zs), P(x0 + FOOT + 3, y0 + FOOT + 3, c.capacidad * zs), P(x0 - 3, y0 + FOOT + 3, c.capacidad * zs)])}
                fill="none" stroke="hsl(var(--foreground))" strokeOpacity={0.45} strokeWidth={0.8} strokeDasharray="3 2" />
            )}
            {c.horas > 0 && (() => { const [tx, ty] = P(x0 + FOOT / 2, y0 + FOOT / 2, c.horas * zs + 6); return (
              <text x={tx} y={ty} fontSize={9.5} fontWeight={700} textAnchor="middle" fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2.5} paintOrder="stroke">{fmtH(c.horas)}</text>
            ); })()}
          </g>
        );
      })}
      {/* nombres al final para que ninguna barra alta los tape */}
      {miembros.map((m, j) => { const [x, y] = P(-8, j * CD + CD / 2, 0); return (
        <text key={`rl${j}`} x={x} y={y} fontSize={12} fontWeight={700} fill={colores[m.id]} stroke="hsl(var(--card))" strokeWidth={3} paintOrder="stroke" textAnchor="end" dominantBaseline="middle">{m.nombre.split(' ')[0]}</text>
      ); })}
    </svg>
  );
}

// ---------- Página: equipo por mesa (admins y ejecutivos) ----------
interface DeskItem { id: string; nombre: string; miembros: number }
interface OverviewMesa extends Omit<Overview, 'candidatos' | 'config' | 'equipo'> {
  desks: DeskItem[]; desk_id?: string; desk_nombre?: string; solo_recientes?: boolean; equipo: Overview['equipo'] | null;
}

export default function EquipoMesa() {
  const { profile } = useAuth();
  const puedeVer = !!profile && (profile.rol === 'admin' || profile.rol === 'ejecutivo');
  const esAdmin = profile?.rol === 'admin';
  const qc = useQueryClient();
  const [deskId, setDeskId] = useState<string>(() => { try { return localStorage.getItem('equipo_mesa_desk') || ''; } catch { return ''; } });
  useEffect(() => { try { if (deskId) localStorage.setItem('equipo_mesa_desk', deskId); } catch { /* ignore */ } }, [deskId]);
  const { data, error, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery<OverviewMesa>({
    queryKey: ['desk-overview', deskId],
    queryFn: () => api.getDeskOverview(deskId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    enabled: puedeVer,
  });
  // Si no hay mesa elegida, tomar la primera con integrantes
  useEffect(() => {
    if (!deskId && data?.desks?.length) {
      const primera = data.desks.find((d) => d.miembros > 0) || data.desks[0];
      setDeskId(primera.id);
    }
  }, [data, deskId]);
  const [vista, setVista] = useState<'2d' | '3d'>(() => { try { return (localStorage.getItem('equipo_mesa_vista') as '2d' | '3d') || '2d'; } catch { return '2d'; } });
  useEffect(() => { try { localStorage.setItem('equipo_mesa_vista', vista); } catch { /* ignore */ } }, [vista]);
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(i); }, []);
  const [hover, setHover] = useState<Celda | null>(null);
  const [gestion, setGestion] = useState(false);
  const [fMiembro, setFMiembro] = useState('todos');
  type FiltroRapido = 'abiertas' | 'vencidas' | 'semana' | 'sin_estimar' | 'en_proceso' | 'bloqueadas' | 'reagendadas' | 'ajustes' | 'entregadas' | 'todas';
  const [fRapido, setFRapido] = useState<FiltroRapido>('abiertas');
  const [fEstado, setFEstado] = useState('all');
  const [busqueda, setBusqueda] = useState('');
  const [limite, setLimite] = useState(100);
  useEffect(() => { setFMiembro('todos'); setLimite(100); }, [deskId]);
  // Desde los chips de una tarjeta: filtra la lista de abajo por esa persona y ese criterio, y baja hasta ella
  const verTareas = (miembroId: string, filtro: FiltroRapido) => {
    setFMiembro(miembroId); setFRapido(filtro); setFEstado('all'); setBusqueda('');
    setTimeout(() => document.getElementById('tareas-mesa')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  // Orden: primero activos y en reunión, luego pausados, conectados sin tarea y fuera; dentro de cada grupo, los más cargados
  // Equipo base de la mesa primero; los de soporte (Administración > Mesas) se muestran solo si se piden
  const [mostrarSoporte, setMostrarSoporte] = useState<boolean>(() => { try { return localStorage.getItem('equipo_mesa_soporte') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('equipo_mesa_soporte', mostrarSoporte ? '1' : '0'); } catch { /* ignore */ } }, [mostrarSoporte]);
  const todos = useMemo(() => [...(data?.miembros ?? [])].sort((a, b) => Number(!!a.es_soporte) - Number(!!b.es_soporte) || rangoMiembro(a) - rangoMiembro(b) || (b.carga.semanas[0]?.pct ?? 0) - (a.carga.semanas[0]?.pct ?? 0)), [data?.miembros]);
  const nSoporte = todos.filter((m) => m.es_soporte).length;
  const miembros = useMemo(() => {
    const base = todos.filter((m) => !m.es_soporte);
    return mostrarSoporte || base.length === 0 ? todos : base;
  }, [todos, mostrarSoporte]);
  const visibles = useMemo(() => new Set(miembros.map((m) => m.id)), [miembros]);
  const colores = useMemo(() => {
    const map: Record<string, string> = {};
    miembros.forEach((m, i) => { map[m.id] = PALETA[i % PALETA.length]; });
    return map;
  }, [miembros]);
  const nombrePor = useMemo(() => Object.fromEntries(miembros.map((m) => [m.id, m.nombre])), [miembros]);

  const tareasFiltradas = useMemo(() => {
    if (!data?.tareas) return [];
    const q = busqueda.trim().toLowerCase();
    const hoy = data.hoy;
    const finSemana = (() => { const d = new Date(`${data.semana_actual}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().slice(0, 10); })();
    const lista = data.tareas.filter((t) => {
      if (fMiembro !== 'todos' && !t.miembros.includes(fMiembro)) return false;
      if (fMiembro === 'todos' && !t.miembros.some((id) => visibles.has(id))) return false;
      if (fEstado !== 'all' && t.estado !== fEstado) return false;
      switch (fRapido) {
        case 'abiertas': if (!t.abierta) return false; break;
        case 'vencidas': if (!t.vencida) return false; break;
        case 'semana': if (!t.abierta || !t.fecha_entrega || t.fecha_entrega > finSemana || t.fecha_entrega < hoy) return false; break;
        case 'sin_estimar': if (!t.abierta || t.estimado_h || t.estimado_tipo_h) return false; break;
        case 'en_proceso': if (t.estado !== 'en_proceso') return false; break;
        case 'bloqueadas': if (t.estado !== 'bloqueado') return false; break;
        case 'reagendadas': if (!t.abierta || t.reagendada === 0) return false; break;
        case 'ajustes': if (!t.abierta || t.ajustes === 0) return false; break;
        case 'entregadas': if (t.abierta) return false; break;
        default: break;
      }
      if (q && !`${t.titulo} ${t.marca ?? ''} ${t.proyecto ?? ''} ${t.mesa ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return lista.sort((a, b) => {
      if (a.abierta !== b.abierta) return a.abierta ? -1 : 1;
      if (a.abierta) {
        if (!!a.fecha_entrega !== !!b.fecha_entrega) return a.fecha_entrega ? -1 : 1;
        if (a.fecha_entrega && b.fecha_entrega && a.fecha_entrega !== b.fecha_entrega) return a.fecha_entrega < b.fecha_entrega ? -1 : 1;
        return ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado);
      }
      return a.updated_at < b.updated_at ? 1 : -1;
    });
  }, [data, fMiembro, fRapido, fEstado, busqueda, visibles]);
  useEffect(() => { setLimite(100); }, [fMiembro, fRapido, fEstado, busqueda]);

  if (!puedeVer) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Lock className="h-8 w-8" /><p>Esta vista es para administradores y ejecutivos.</p>
      </CardContent></Card>
    );
  }
  if (isLoading && !data) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (error || !data) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <AlertTriangle className="h-8 w-8" /><p>No se pudo cargar la vista de la mesa.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
      </CardContent></Card>
    );
  }

  const eq = data.equipo;
  const segundosDesde = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));
  const selectorMesa = (
    <Select value={deskId} onValueChange={setDeskId}>
      <SelectTrigger className="h-9 w-[240px]"><SelectValue placeholder="Elige una mesa" /></SelectTrigger>
      <SelectContent>{data.desks.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre} <span className="text-muted-foreground">({d.miembros})</span></SelectItem>)}</SelectContent>
    </Select>
  );

  // "Ahora mismo": quién está en qué
  const enReunion = (m: Miembro) => !!m.reunion_ahora && m.timer?.status !== 'active';
  const autoPausado = (m: Miembro) => !m.timer && !!m.autopausa && !!m.asistencia_hoy && !m.asistencia_hoy.check_out;
  const ahora = {
    trabajando: miembros.filter((m) => m.timer?.status === 'active'),
    reunion: miembros.filter(enReunion),
    pausa: miembros.filter((m) => (m.timer?.status === 'paused' || autoPausado(m)) && !enReunion(m) && !(m.asistencia_hoy?.lunch_start && !m.asistencia_hoy?.lunch_end)),
    almuerzo: miembros.filter((m) => !!m.asistencia_hoy?.lunch_start && !m.asistencia_hoy?.lunch_end && !enReunion(m)),
    sinTarea: miembros.filter((m) => !m.timer && !autoPausado(m) && !enReunion(m) && !!m.asistencia_hoy && !m.asistencia_hoy.check_out && !(m.asistencia_hoy.lunch_start && !m.asistencia_hoy.lunch_end)),
    fuera: miembros.filter((m) => !m.timer && !enReunion(m) && (!m.asistencia_hoy || !!m.asistencia_hoy.check_out)),
  };
  const conUtilizacion = miembros.filter((m) => m.utilizacion_hoy_pct != null);
  const utilizacionMesa = conUtilizacion.length ? Math.round(conUtilizacion.reduce((a, m) => a + (m.utilizacion_hoy_pct as number), 0) / conUtilizacion.length) : null;
  // Regla de Steven: por encima del 85 % hay que tenerlo en cuenta (ámbar); 40–85 sano; menos de 40 subutilizado
  const utilCls = (p: number) => (p > 85 ? 'text-amber-600 dark:text-amber-400' : p >= 40 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400');
  const alTope = miembros.filter((m) => (m.utilizacion_hoy_pct ?? 0) > 85);
  const tardes = miembros.filter((m) => m.ingreso_tarde);
  const conCapacidad = miembros.filter((m) => (m.carga.semanas[0]?.pct ?? 0) < 70);
  const saturados = miembros.filter((m) => (m.carga.semanas[0]?.pct ?? 0) > 100);
  const veredictoUI = eq ? {
    contratar: { titulo: 'Mesa sobrecargada: no le cabe trabajo nuevo', icon: <AlertTriangle className="h-6 w-6" />, cls: 'border-rose-500/50 bg-rose-500/10', color: 'text-rose-600 dark:text-rose-400' },
    al_limite: { titulo: 'Al límite: aguanta, pero con cuidado', icon: <AlertTriangle className="h-6 w-6" />, cls: 'border-amber-500/50 bg-amber-500/10', color: 'text-amber-600 dark:text-amber-400' },
    ok: { titulo: 'Con capacidad: sí entra trabajo nuevo', icon: <CheckCircle2 className="h-6 w-6" />, cls: 'border-emerald-500/50 bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400' },
  }[eq.veredicto] : null;
  const semanasLabels = miembros[0]?.horas.por_semana.map((s) => fmtDM(s.inicio)) ?? [];
  const serieEquipo = semanasLabels.map((label, i) => ({
    semana: label,
    horas: Math.round(miembros.reduce((a, m) => a + (m.horas.por_semana[i]?.horas ?? 0), 0) * 10) / 10,
    entregas: miembros.reduce((a, m) => a + (m.entregas.por_semana[i]?.entregas ?? 0), 0),
  }));
  const columnasCarga = [
    ...(miembros[0]?.carga.semanas ?? []).map((s, i) => ({ key: s.inicio, label: i === 0 ? `Esta sem. ${fmtDM(s.inicio)}` : `S${i + 1} ${fmtDM(s.inicio)}` })),
    { key: 'sin_fecha', label: 'Sin fecha' }, { key: 'despues', label: '+8 sem' },
  ];
  const permite3d = miembros.length > 0 && miembros.length <= 8;
  const Lista = ({ ms }: { ms: Miembro[] }) => ms.length ? <span className="text-foreground">{ms.map((m) => m.nombre.split(' ')[0]).join(', ')}</span> : <span className="text-muted-foreground">nadie</span>;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Equipo por mesa</h2>
          <p className="text-sm text-muted-foreground">
            Carga de trabajo, tiempos y tareas de cada integrante · se actualiza sola cada minuto · actualizado hace {segundosDesde < 60 ? `${segundosDesde} s` : `${Math.floor(segundosDesde / 60)} min`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectorMesa}
          {nSoporte > 0 && (
            <Button size="sm" variant={mostrarSoporte ? 'default' : 'outline'} onClick={() => setMostrarSoporte((v) => !v)} className="gap-1.5" title="Soporte: personas de otras mesas que apoyan a esta. Se marcan en Administración > Mesas y no cuentan en los totales de la mesa.">
              <Users className="h-4 w-4" />{mostrarSoporte ? `Ocultar soporte (${nSoporte})` : `Ver soporte (${nSoporte})`}
            </Button>
          )}
          {permite3d && (
            <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
              <Button size="sm" variant={vista === '2d' ? 'default' : 'ghost'} onClick={() => setVista('2d')} className="gap-1.5"><Grid3x3 className="h-4 w-4" />2D</Button>
              <Button size="sm" variant={vista === '3d' ? 'default' : 'ghost'} onClick={() => setVista('3d')} className="gap-1.5"><Box className="h-4 w-4" />3D</Button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />Actualizar
          </Button>
          {esAdmin && miembros.length > 0 && <Button size="sm" variant="outline" onClick={() => setGestion(true)} className="gap-1.5"><Settings2 className="h-4 w-4" />Capacidad</Button>}
        </div>
      </div>

      {miembros.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Esta mesa no tiene integrantes activos. Elige otra mesa arriba.</CardContent></Card>
      ) : (
        <>
          {/* Ahora mismo */}
          <Card>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Ahora mismo · {data.desk_nombre} · {todos.length - nSoporte} del equipo base{nSoporte > 0 ? (mostrarSoporte ? ` + ${nSoporte} de soporte` : ` · ${nSoporte} de soporte ocultos`) : ''}</div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 text-sm">
                <div className="flex gap-2 items-start"><span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium shrink-0"><Play className="h-3.5 w-3.5" />Trabajando ({ahora.trabajando.length}):</span><Lista ms={ahora.trabajando} /></div>
                <div className="flex gap-2 items-start"><span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium shrink-0"><CheckCircle2 className="h-3.5 w-3.5" />En reunión ({ahora.reunion.length}):</span><span>{ahora.reunion.length ? ahora.reunion.map((m, i) => <span key={m.id}>{i ? ', ' : ''}<span className="text-foreground" title={m.reunion_ahora?.summary}>{m.nombre.split(' ')[0]}</span></span>) : <span className="text-muted-foreground">nadie</span>}</span></div>
                <div className="flex gap-2 items-start"><span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium shrink-0"><Clock className="h-3.5 w-3.5" />Conectados sin tarea ({ahora.sinTarea.length}):</span><Lista ms={ahora.sinTarea} /></div>
                <div className="flex gap-2 items-start"><span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium shrink-0"><Pause className="h-3.5 w-3.5" />Timer en pausa ({ahora.pausa.length}):</span><Lista ms={ahora.pausa} /></div>
                <div className="flex gap-2 items-start"><span className="inline-flex items-center gap-1 text-muted-foreground font-medium shrink-0"><Utensils className="h-3.5 w-3.5" />En almuerzo ({ahora.almuerzo.length}):</span><Lista ms={ahora.almuerzo} /></div>
                <div className="flex gap-2 items-start"><span className="inline-flex items-center gap-1 text-muted-foreground font-medium shrink-0"><Clock className="h-3.5 w-3.5" />Fuera / sin ingreso ({ahora.fuera.length}):</span><Lista ms={ahora.fuera} /></div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-sm mt-3 pt-3 border-t">
                <div className="flex gap-2 items-start"><span className="font-medium text-emerald-600 dark:text-emerald-400 shrink-0">Con capacidad esta semana (&lt;70 %):</span><Lista ms={conCapacidad} /></div>
                <div className="flex gap-2 items-start"><span className="font-medium text-rose-600 dark:text-rose-400 shrink-0">Saturados (&gt;100 %):</span><Lista ms={saturados} /></div>
              </div>
              {utilizacionMesa != null && (
                <div className="text-xs text-muted-foreground mt-3 pt-3 border-t space-y-1">
                  <div className="flex gap-2 items-start"><span className="font-medium text-amber-600 dark:text-amber-400 shrink-0">Al tope hoy (&gt;85 % de utilización):</span><Lista ms={alTope} /></div>
                  <div className="flex gap-2 items-start"><span className="font-medium text-amber-600 dark:text-amber-400 shrink-0">Ingreso tarde hoy (después de las {data.hora_limite_ingreso ?? '09:15'}):</span>{tardes.length ? <span className="text-foreground">{tardes.map((m) => `${m.nombre.split(' ')[0]} (${fmtHora(m.primer_ingreso)})`).join(', ')}</span> : <span className="text-muted-foreground">nadie</span>}</div>
                  <div>Utilización de la mesa hoy: <span className={cn('font-semibold', utilCls(utilizacionMesa))}>{utilizacionMesa} %</span> · promedio de {conUtilizacion.length} personas con ingreso. Utilización = (tiempo con timer + reuniones del calendario) ÷ tiempo conectado, sin almuerzo. Reuniones: solo las que la persona aceptó u organizó (con invitados o videollamada), dentro de la jornada marcada y sin el tiempo en que tenía el timer corriendo. Verde 40–85 %, ámbar más de 85 % (al tope), rojo menos de 40 %.</div>
                </div>
              )}
            </CardContent>
          </Card>

          {eq && veredictoUI && (
            <Card className={cn('border-2', veredictoUI.cls)}>
              <CardContent className="p-4 md:p-5">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className={cn('flex items-center gap-2 shrink-0', veredictoUI.color)}>
                    {veredictoUI.icon}
                    <div>
                      <div className="text-xs uppercase tracking-wide opacity-80">¿Cómo está la mesa?</div>
                      <div className="text-lg font-bold leading-tight">{veredictoUI.titulo}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-1 text-sm">
                    <div><div className="text-muted-foreground text-xs">Capacidad para proyectos</div><div className="font-semibold text-lg">{eq.capacidad_semana} h/sem</div>
                      <div className="text-xs text-muted-foreground">{eq.reservadas_semana > 0 ? `${eq.capacidad_bruta} h − ${eq.reservadas_semana} h reservadas` : `${miembros.length} personas`}</div></div>
                    <div><div className="text-muted-foreground text-xs">Horas comprometidas (abiertas)</div><div className="font-semibold text-lg">{fmtH(eq.horas_comprometidas)}</div>
                      <div className="text-xs text-muted-foreground">{eq.tareas_abiertas} tareas abiertas{eq.bloqueadas?.tareas ? ` · ${eq.bloqueadas.tareas} bloqueadas van aparte (${fmtH(eq.bloqueadas.horas)})` : ''}</div></div>
                    <div><div className="text-muted-foreground text-xs">Semanas para vaciar la cola</div>
                      <div className="font-semibold text-lg">{eq.semanas_para_vaciar ?? '—'} <span className="text-xs font-normal text-muted-foreground">a capacidad plena</span></div>
                      <div className="text-xs text-muted-foreground">{eq.semanas_a_ritmo_real != null ? `${eq.semanas_a_ritmo_real} sem al ritmo real del timer (${fmtH(eq.ritmo_semanal_real)}/sem)` : 'sin ritmo real (no usan timer)'}</div></div>
                    <div><div className="text-muted-foreground text-xs">Faltan (próx. 4 semanas)</div>
                      <div className="font-semibold text-lg">{fmtH(eq.horas_faltantes_semana)}/sem <span className="text-xs font-normal text-muted-foreground">≈ {eq.personas_faltantes} personas</span></div>
                      <div className="text-xs text-muted-foreground">{eq.saturados.length ? `Saturados: ${eq.saturados.join(', ')}` : 'Nadie por encima del 100%'}</div></div>
                  </div>
                </div>
                {eq.pct_sin_estimar > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                    <span>{eq.sin_estimar} de {eq.tareas_abiertas} tareas abiertas ({eq.pct_sin_estimar}%) no tienen horas estimadas ni estimado por tipo de entregable: no suman horas a la carga (la carga real puede ser mayor). Configura el tiempo por tipo en Administración &gt; Configuración.</span>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tarjetas */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {miembros.map((m, idx) => {
              const c = m.conteos, k = m.carga;
              const s0 = k.semanas[0], s1 = k.semanas[1];
              const enAlmuerzo = !!m.asistencia_hoy?.lunch_start && !m.asistencia_hoy?.lunch_end;
              const conectado = !!m.asistencia_hoy && !m.asistencia_hoy.check_out;
              let estadoAhora: { icon: JSX.Element; texto: string; cls: string };
              if (m.timer?.status === 'active') estadoAhora = { icon: <Play className="h-3.5 w-3.5" />, texto: `Trabajando en «${m.timer.titulo}» · ${fmtDur(m.timer.segundos)}`, cls: 'text-emerald-600 dark:text-emerald-400' };
              else if (m.reunion_ahora) estadoAhora = { icon: <CheckCircle2 className="h-3.5 w-3.5" />, texto: `En reunión: «${m.reunion_ahora.summary}» hasta ${fmtHora(m.reunion_ahora.end)}`, cls: 'text-emerald-600 dark:text-emerald-400' };
              else if (enAlmuerzo) estadoAhora = { icon: <Utensils className="h-3.5 w-3.5" />, texto: `En almuerzo desde ${fmtHora(m.asistencia_hoy!.lunch_start)}`, cls: 'text-amber-600 dark:text-amber-400' };
              else if (m.timer?.status === 'paused') estadoAhora = { icon: <Pause className="h-3.5 w-3.5" />, texto: `Timer en pausa: «${m.timer.titulo}»`, cls: 'text-amber-600 dark:text-amber-400' };
              else if (conectado && m.autopausa) estadoAhora = { icon: <Pause className="h-3.5 w-3.5" />, texto: `Timer pausado solo a las ${fmtHora(m.autopausa.end_time)} en «${m.autopausa.titulo}»: Tiusdei cerrado o la pestaña se durmió`, cls: 'text-amber-600 dark:text-amber-400' };
              else if (conectado) estadoAhora = { icon: <Clock className="h-3.5 w-3.5" />, texto: `Conectado desde ${fmtHora(m.asistencia_hoy!.check_in)} sin tarea activa`, cls: 'text-amber-600 dark:text-amber-400' };
              else if (m.asistencia_hoy?.check_out) estadoAhora = { icon: <Clock className="h-3.5 w-3.5" />, texto: `Salió a las ${fmtHora(m.asistencia_hoy.check_out)} (entró ${fmtHora(m.asistencia_hoy.check_in)})`, cls: 'text-muted-foreground' };
              else estadoAhora = { icon: <Clock className="h-3.5 w-3.5" />, texto: 'Sin ingreso registrado hoy', cls: 'text-muted-foreground' };
              const semVaciar = k.semanas_para_vaciar ?? 0;
              const rango = rangoMiembro(m);
              return (
                <div key={m.id} className="contents">
                {(idx === 0 || !!miembros[idx - 1].es_soporte !== !!m.es_soporte) && (
                  <div className={cn('md:col-span-2 xl:col-span-3 flex items-baseline gap-2 border-b pb-1', idx > 0 && 'mt-4')}>
                    <span className="text-sm font-semibold text-foreground">{m.es_soporte ? 'Soporte de otras mesas' : 'Equipo de la mesa'}</span>
                    <span className="text-xs text-muted-foreground">{miembros.filter((x) => !!x.es_soporte === !!m.es_soporte).length} personas{m.es_soporte ? ' · apoyan a esta mesa, no cuentan en sus totales' : ''}</span>
                  </div>
                )}
                {(idx === 0 || !!miembros[idx - 1].es_soporte !== !!m.es_soporte || rangoMiembro(miembros[idx - 1]) !== rango) && (
                  <div className="md:col-span-2 xl:col-span-3 text-[11px] uppercase tracking-wide text-muted-foreground mt-1">{ETIQUETA_RANGO[rango]} ({miembros.filter((x) => !!x.es_soporte === !!m.es_soporte && rangoMiembro(x) === rango).length})</div>
                )}
                <Card className={cn('overflow-hidden', rango === 0 && 'ring-1 ring-emerald-500/40')} style={{ borderTopColor: colores[m.id], borderTopWidth: 3 }}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative">
                          <Avatar className="h-9 w-9">
                            {m.avatar_url ? <AvatarImage src={m.avatar_url} alt={m.nombre} className="object-cover" /> : null}
                            <AvatarFallback className="text-xs font-semibold" style={{ background: `${colores[m.id]}33`, color: colores[m.id] }}>{getInitials(m.nombre)}</AvatarFallback>
                          </Avatar>
                          <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background', m.presencia === 'online' ? 'bg-emerald-500' : m.presencia === 'away' ? 'bg-amber-500' : 'bg-slate-400')} title={`Presencia en Tiusdei: ${m.presencia === 'online' ? 'en línea' : m.presencia === 'away' ? 'ausente' : 'desconectado'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate flex items-center gap-1.5">{m.nombre}{m.es_soporte && <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" title="Apoya a esta mesa desde otra; no cuenta en los totales">Soporte</span>}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{m.rol} · {m.capacidad_semana} h/sem{m.reservadas_semana > 0 && <> − {m.reservadas_semana} h reservadas = <span className="font-medium text-foreground">{m.capacidad_proyectos} h</span></>}</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 cursor-pointer hover:bg-muted" title="Ver sus tareas abiertas" onClick={() => verTareas(m.id, 'abiertas')}>{c.abiertas} abiertas</Badge>
                    </div>
                    <div className={cn('flex items-start gap-1.5 text-xs', estadoAhora.cls)}>{estadoAhora.icon}<span className="leading-snug">{estadoAhora.texto}</span></div>
                    {m.ingreso_tarde && <div className="text-[11px] text-amber-700 dark:text-amber-400">⚠ Marcó ingreso tarde: {fmtHora(m.primer_ingreso)} (límite {data.hora_limite_ingreso ?? '09:15'})</div>}
                    {(m.utilizacion_hoy_pct != null || (m.horas.reuniones_hoy_total ?? 0) > 0) && (
                      <div className="text-[11px] text-muted-foreground" title="Utilización = (tiempo con timer + reuniones del calendario) ÷ tiempo conectado hoy, sin almuerzo. Solo cuentan reuniones aceptadas u organizadas, dentro de la jornada marcada y sin el tiempo con timer. Más de 85 % = al tope.">
                        {m.utilizacion_hoy_pct != null && <>Utilización hoy: <span className={cn('font-semibold', utilCls(m.utilizacion_hoy_pct))}>{m.utilizacion_hoy_pct} %{m.utilizacion_hoy_pct > 85 ? ' ⚠' : ''}</span> ({fmtH(m.horas.hoy)} de {fmtH((m.asistencia_hoy_seg ?? 0) / 3600)} conectado: timer {fmtH(m.horas.timer_hoy ?? m.horas.hoy)} + reuniones {fmtH(m.horas.reuniones_hoy ?? 0)})</>}
                        {(m.horas.reuniones_hoy_total ?? 0) > 0 && <>{m.utilizacion_hoy_pct != null ? ' · ' : ''}Reuniones agendadas hoy: {fmtH(m.horas.reuniones_hoy_total ?? 0)}{m.reuniones_hoy ? ` (${m.reuniones_hoy})` : ''}</>}
                        {!m.calendario_conectado && <>{' · '}<span title="Sin Google Calendar conectado: las reuniones no se cuentan">sin calendario</span></>}
                      </div>
                    )}
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground -mb-2" title="Tiempo con timer en tareas + reuniones del calendario que aceptó u organizó (sin contar dos veces el tiempo con timer). Es lo que ya trabajó, no lo que tiene disponible.">Horas trabajadas (timer + reuniones)</div>
                    <div className="grid grid-cols-4 gap-1 text-center">
                      {[['Hoy', m.horas.hoy, 'Trabajado hoy'], ['Esta semana', m.horas.semana, 'Trabajado desde el lunes'], ['Últimos 30 días', m.horas.ult30, 'Trabajado en los últimos 30 días (no es lo disponible)'], ['Promedio/sem', m.horas.ritmo_semanal, 'Promedio semanal de las 4 semanas completas anteriores']].map(([l, v, tip]) => (
                        <div key={l as string} className="rounded-md bg-muted/50 py-1.5" title={tip as string}>
                          <div className="text-sm font-semibold">{fmtH(v as number)}</div>
                          <div className="text-[10px] text-muted-foreground">{l}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      {[s0, s1].filter(Boolean).map((s, i) => (
                        <div key={s.inicio} className="text-xs">
                          <div className="flex justify-between mb-0.5"><span className="text-muted-foreground">{i === 0 ? 'Pendiente esta semana' : 'Pendiente próxima semana'}{i === 0 && k.vencidas.tareas > 0 ? ` (incluye ${k.vencidas.tareas} vencidas)` : ''}</span><span className="font-medium">{fmtH(s.horas)} / {s.capacidad}h · {s.pct}%</span></div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, s.pct)}%`, background: colorCarga(s.pct) }} /></div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]" title="Haz clic en un chip para ver esas tareas abajo">
                      {c.vencidas > 0 && <Badge variant="outline" className="border-rose-500/50 text-rose-600 dark:text-rose-400 gap-1 cursor-pointer hover:bg-rose-500/10" onClick={() => verTareas(m.id, 'vencidas')}><Flame className="h-3 w-3" />{c.vencidas} vencidas</Badge>}
                      {c.bloqueadas > 0 && <Badge variant="outline" className="gap-1 border-slate-400/60 text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-muted" onClick={() => verTareas(m.id, 'bloqueadas')} title="Esperando al cliente u otra área: no cuentan en la carga ni como vencidas"><Lock className="h-3 w-3" />{c.bloqueadas} bloqueadas{k.bloqueadas?.dias_max ? ` · hasta ${k.bloqueadas.dias_max} d` : ''}</Badge>}
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => verTareas(m.id, 'en_proceso')}>{c.en_proceso} en proceso</Badge>
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => verTareas(m.id, 'semana')}>{c.vence_esta_semana} vencen esta sem.</Badge>
                      {c.sin_estimar > 0 && <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-amber-500/10" onClick={() => verTareas(m.id, 'sin_estimar')}>{c.sin_estimar} sin estimar</Badge>}
                      {c.reagendadas > 0 && <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-muted" onClick={() => verTareas(m.id, 'reagendadas')}><RotateCcw className="h-3 w-3" />{c.reagendadas} reagendadas</Badge>}
                      {c.con_ajustes > 0 && <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-muted" onClick={() => verTareas(m.id, 'ajustes')}><Wrench className="h-3 w-3" />{c.con_ajustes} con ajustes</Badge>}
                      <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-muted" onClick={() => verTareas(m.id, 'entregadas')}><TrendingUp className="h-3 w-3" />{m.entregas.ult30} entregadas en 30 d</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      Cola: <span className="font-medium text-foreground">{fmtH(k.horas_comprometidas)}</span> → <span className={cn('font-medium', semVaciar > 4 ? 'text-rose-600 dark:text-rose-400' : semVaciar > 2 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{k.semanas_para_vaciar ?? '—'} sem</span> a capacidad plena
                      {k.semanas_a_ritmo_real != null && <> · <span className="font-medium text-foreground">{k.semanas_a_ritmo_real} sem</span> a su ritmo real</>}
{(k.bloqueadas?.tareas ?? 0) > 0 && <div className="mt-1 flex items-center gap-1"><Lock className="h-3 w-3" />En espera: <span className="font-medium text-foreground">{fmtH(k.bloqueadas!.horas)}</span> en {k.bloqueadas!.tareas} bloqueadas (promedio {k.bloqueadas!.dias_promedio} d); no suman a la cola</div>}
                    </div>
                  </CardContent>
                </Card>
                </div>
              );
            })}
          </div>

          {/* Carga por semana */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                <span>Carga por semana (horas restantes por fecha de entrega vs. capacidad)</span>
                <span className="text-xs font-normal text-muted-foreground flex items-center gap-3">
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#10b981' }} />≤70%</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#f59e0b' }} />70–100%</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#f43f5e' }} />&gt;100%</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vista === '3d' && permite3d ? (
                <div>
                  <IsoCarga miembros={miembros} colores={colores} onHover={setHover} />
                  <div className="mt-2 min-h-[22px] text-xs text-muted-foreground">
                    {hover ? (
                      <span><span className="font-semibold" style={{ color: colores[hover.miembro.id] }}>{hover.miembro.nombre}</span> · {hover.etiqueta}: <span className="font-semibold text-foreground">{fmtH(hover.horas)}</span>
                        {hover.capacidad != null && <> de {hover.capacidad}h (<span style={{ color: colorCarga(hover.pct) }} className="font-semibold">{hover.pct}%</span>)</>} · {hover.tareas} tareas{hover.vencidas > 0 && <> · {fmtH(hover.vencidas)} ya vencidas</>}</span>
                    ) : 'Pasa el mouse por una barra para ver el detalle.'}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-separate border-spacing-1">
                    <thead><tr>
                      <th className="text-left font-medium text-muted-foreground px-1">Persona</th>
                      {columnasCarga.map((c) => <th key={c.key} className="font-medium text-muted-foreground px-1 whitespace-nowrap">{c.label}</th>)}
                    </tr></thead>
                    <tbody>
                      {miembros.map((m) => (
                        <tr key={m.id}>
                          <td className="px-1 font-semibold whitespace-nowrap" style={{ color: colores[m.id] }}>{m.nombre.split(' ')[0]} <span className="text-muted-foreground font-normal">({m.capacidad_proyectos}h)</span></td>
                          {m.carga.semanas.map((s, i) => (
                            <td key={s.inicio} className={cn('rounded-md px-2 py-2 text-center', bgCarga(s.pct))} title={`${s.tareas} tareas${i === 0 && m.carga.vencidas.tareas ? ` · ${m.carga.vencidas.tareas} vencidas (${fmtH(m.carga.vencidas.horas)})` : ''}`}>
                              <div className="font-semibold">{fmtH(s.horas)}</div><div className="opacity-80">{s.pct}% · {s.tareas} t</div>
                            </td>
                          ))}
                          <td className="rounded-md px-2 py-2 text-center bg-muted/40 text-muted-foreground"><div className="font-semibold">{fmtH(m.carga.sin_fecha.horas)}</div><div>{m.carga.sin_fecha.tareas} t</div></td>
                          <td className="rounded-md px-2 py-2 text-center bg-muted/40 text-muted-foreground"><div className="font-semibold">{fmtH(m.carga.despues.horas)}</div><div>{m.carga.despues.tareas} t</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historial de la mesa */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Horas registradas por la mesa (timer, últimas 8 semanas)</CardTitle></CardHeader>
              <CardContent className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieEquipo} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <RTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v} h`, 'Horas']} />
                    <Bar dataKey="horas" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Tareas entregadas por la mesa (últimas 8 semanas)</CardTitle></CardHeader>
              <CardContent className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieEquipo} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <RTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [v, 'Entregadas']} />
                    <Bar dataKey="entregas" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Proyectos */}
          {data.proyectos.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Proyectos con tareas abiertas de la mesa ({data.proyectos.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Proyecto</TableHead><TableHead>Marca</TableHead><TableHead className="text-right">Abiertas</TableHead>
                      <TableHead className="text-right">Vencidas</TableHead><TableHead className="text-right">Horas rest.</TableHead><TableHead>Reparto</TableHead><TableHead>Fin</TableHead><TableHead>Salud</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.proyectos.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.nombre}<div className="text-[11px] text-muted-foreground">{p.estado}</div></TableCell>
                          <TableCell className="text-muted-foreground">{p.marca ?? '—'}</TableCell>
                          <TableCell className="text-right">{p.abiertas}<span className="text-muted-foreground">/{p.total}</span></TableCell>
                          <TableCell className={cn('text-right', p.vencidas > 0 && 'text-rose-600 dark:text-rose-400 font-medium')}>{p.vencidas}</TableCell>
                          <TableCell className="text-right">{fmtH(p.horas_restantes)}</TableCell>
                          <TableCell><div className="flex gap-1 flex-wrap">{Object.entries(p.por_miembro).map(([id, n]) => (
                            <span key={id} className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: `${colores[id]}22`, color: colores[id] }}>{(nombrePor[id] || '?').split(' ')[0]} {n}</span>
                          ))}</div></TableCell>
                          <TableCell className={cn('whitespace-nowrap', p.fecha_fin && p.fecha_fin < data.hoy && 'text-rose-600 dark:text-rose-400')}>{fmtDM(p.fecha_fin)}</TableCell>
                          <TableCell><span className={cn('inline-block h-2.5 w-2.5 rounded-full', p.salud === 'rojo' ? 'bg-rose-500' : p.salud === 'amarillo' ? 'bg-amber-500' : 'bg-emerald-500')} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tareas */}
          <Card id="tareas-mesa" className="scroll-mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                <span>Tareas {fMiembro !== 'todos' ? <>de <span style={{ color: colores[fMiembro] }}>{nombrePor[fMiembro]}</span></> : 'de la mesa'} <span className="text-muted-foreground font-normal text-sm">({tareasFiltradas.length} de {data.tareas.length}{data.solo_recientes ? ' · abiertas y cerradas en los últimos 30 días' : ''})</span></span>
                {(fMiembro !== 'todos' || fRapido !== 'abiertas' || fEstado !== 'all' || busqueda) && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setFMiembro('todos'); setFRapido('abiertas'); setFEstado('all'); setBusqueda(''); }}>Quitar filtros</Button>
                )}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <div className="flex gap-1 p-1 rounded-lg bg-muted/50 flex-wrap">
                  {([['abiertas', 'Abiertas'], ['vencidas', 'Vencidas'], ['semana', 'Esta semana'], ['en_proceso', 'En proceso'], ['bloqueadas', 'Bloqueadas'], ['sin_estimar', 'Sin estimar'], ['reagendadas', 'Reagendadas'], ['ajustes', 'Con ajustes'], ['entregadas', 'Entregadas 30 d'], ['todas', 'Todas']] as const).map(([k, l]) => (
                    <Button key={k} size="sm" variant={fRapido === k ? 'default' : 'ghost'} className="h-7 text-xs" onClick={() => setFRapido(k)}>{l}</Button>
                  ))}
                </div>
                <Select value={fMiembro} onValueChange={setFMiembro}>
                  <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="todos">Toda la mesa</SelectItem>{miembros.map((m) => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={fEstado} onValueChange={setFEstado}>
                  <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todos los estados</SelectItem>{ORDEN_ESTADO.map((e) => <SelectItem key={e} value={e}>{ESTADO[e]?.label ?? e}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar tarea, marca, proyecto…" className="h-8 w-[220px] text-xs" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Tarea</TableHead><TableHead>Quién</TableHead><TableHead>Estado</TableHead><TableHead>Prior.</TableHead>
                    <TableHead>Entrega</TableHead><TableHead className="text-right">Est. / Trab.</TableHead><TableHead>Señales</TableHead><TableHead />
                  </TableRow></TableHeader>
                  <TableBody>
                    {tareasFiltradas.slice(0, limite).map((t) => (
                      <TableRow key={t.id} className={cn(t.vencida && 'bg-rose-500/5')}>
                        <TableCell className="max-w-[360px]">
                          <div className="font-medium leading-snug line-clamp-2">{t.es_subtarea && <span className="text-muted-foreground mr-1">↳</span>}{t.titulo}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{[t.marca, t.proyecto, t.mesa].filter(Boolean).join(' · ') || '—'}</div>
                        </TableCell>
                        <TableCell><div className="flex -space-x-1.5">
                          {t.miembros.map((id) => <span key={id} className="h-6 w-6 rounded-full border-2 border-background text-[9px] font-semibold flex items-center justify-center" style={{ background: `${colores[id]}33`, color: colores[id] }} title={nombrePor[id]}>{getInitials(nombrePor[id] || '?')}</span>)}
                          {t.responsables.length > t.miembros.length && <span className="h-6 w-6 rounded-full border-2 border-background bg-muted text-[9px] flex items-center justify-center text-muted-foreground" title="Otros responsables fuera de la mesa">+{t.responsables.length - t.miembros.length}</span>}
                        </div></TableCell>
                        <TableCell><span className={cn('text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium', ESTADO[t.estado]?.cls ?? 'bg-muted')}>{ESTADO[t.estado]?.label ?? t.estado}</span></TableCell>
                        <TableCell><span className={cn('text-[11px] font-medium', t.prioridad === 'alta' ? 'text-rose-600 dark:text-rose-400' : t.prioridad === 'media' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{t.prioridad}</span></TableCell>
                        <TableCell className={cn('whitespace-nowrap text-xs', t.vencida && 'text-rose-600 dark:text-rose-400 font-semibold')}>{fmtDM(t.fecha_entrega)}{t.vencida && ' ⚠'}{t.bloqueada && <span className="ml-1 text-muted-foreground font-normal" title="Bloqueada: no cuenta como vencida">🔒 {t.bloqueada_dias ?? 0} d</span>}</TableCell>
                        <TableCell className="text-right whitespace-nowrap text-xs">{t.estimado_h ? fmtH(t.estimado_h) : t.estimado_tipo_h ? <span title="Estimado estándar por tipo de entregable">~{fmtH(t.estimado_tipo_h)}</span> : <span className="text-amber-600 dark:text-amber-400">sin est.</span>} / {fmtH(t.trabajado_h)}</TableCell>
                        <TableCell><div className="flex gap-1 flex-wrap text-[10px] text-muted-foreground">
                          {t.timer_activo && <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5"><Play className="h-3 w-3" />timer</span>}
                          {t.reagendada > 0 && <span className="flex items-center gap-0.5" title="Veces reagendada"><RotateCcw className="h-3 w-3" />{t.reagendada}</span>}
                          {t.ajustes > 0 && <span className="flex items-center gap-0.5" title="Veces devuelta a ajustes"><Wrench className="h-3 w-3" />{t.ajustes}</span>}
                        </div></TableCell>
                        <TableCell><Button asChild size="sm" variant="ghost" className="h-7 px-2"><Link to={`/tareas?task=${t.id}`} title="Abrir tarea"><ExternalLink className="h-3.5 w-3.5" /></Link></Button></TableCell>
                      </TableRow>
                    ))}
                    {tareasFiltradas.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No hay tareas con estos filtros.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              {tareasFiltradas.length > limite && (
                <div className="p-3 text-center"><Button variant="outline" size="sm" onClick={() => setLimite((l) => l + 100)}>Ver {Math.min(100, tareasFiltradas.length - limite)} más</Button></div>
              )}
            </CardContent>
          </Card>

          {esAdmin && <CapacidadMesa open={gestion} onOpenChange={setGestion} miembros={miembros} onSaved={() => qc.invalidateQueries({ queryKey: ['desk-overview', deskId] })} />}
        </>
      )}
    </div>
  );
}

// Orden de preferencia: activos y en reunión primero, después pausados, conectados sin tarea y fuera
function rangoMiembro(m: Miembro): number {
  if (m.timer?.status === 'active' || m.reunion_ahora) return 0;
  if (m.timer?.status === 'paused' || (!m.timer && m.autopausa && m.asistencia_hoy && !m.asistencia_hoy.check_out)) return 1;
  if (m.asistencia_hoy && !m.asistencia_hoy.check_out) return 2;
  return 3;
}
const ETIQUETA_RANGO: Record<number, string> = { 0: 'Activos y en reunión', 1: 'Timer en pausa', 2: 'Conectados sin tarea activa', 3: 'Fuera / sin ingreso' };

// ---------- Diálogo: capacidad y horas reservadas de los integrantes de la mesa ----------
function CapacidadMesa({ open, onOpenChange, miembros, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; miembros: Miembro[]; onSaved: () => void }) {
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (open) {
      setCaps(Object.fromEntries(miembros.map((m) => [m.id, String(m.capacidad_semana)])));
      setRes(Object.fromEntries(miembros.map((m) => [m.id, String(m.reservadas_semana)])));
    }
  }, [open, miembros]);
  const guardar = async () => {
    setGuardando(true);
    try {
      for (const m of miembros) {
        const v = Number(caps[m.id]);
        const r = Number(res[m.id]);
        const body: { weekly_capacity_hours?: number; reserved_hours?: number } = {};
        if (v && v !== m.capacidad_semana) body.weekly_capacity_hours = v;
        if (!Number.isNaN(r) && r !== m.reservadas_semana) body.reserved_hours = r;
        if (Object.keys(body).length) await api.updateDeskMember(m.id, body);
      }
      toast.success('Capacidad actualizada');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Capacidad de la mesa</DialogTitle>
          <DialogDescription>Horas por semana que puede dedicar cada persona y cuántas reserva a mantenimiento, cotizaciones o soporte (se restan antes de medir la carga).</DialogDescription>
        </DialogHeader>
        <div className="max-h-[420px] overflow-y-auto pr-1">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 items-center text-sm">
            <span /><span className="text-xs text-muted-foreground text-center">Capacidad</span><span className="text-xs text-muted-foreground text-center">Reservadas</span>
            {miembros.map((m) => (
              <div key={m.id} className="contents">
                <div className="min-w-0"><div className="truncate">{m.nombre}</div><div className="text-[11px] text-muted-foreground">sugerido reservar: {fmtH(m.reservadas_sugeridas)}/sem</div></div>
                <div className="flex items-center gap-1"><Input type="number" min={1} max={80} value={caps[m.id] ?? ''} onChange={(e) => setCaps((c) => ({ ...c, [m.id]: e.target.value }))} className="h-8 w-16 text-sm" /><span className="text-xs text-muted-foreground">h</span></div>
                <div className="flex items-center gap-1"><Input type="number" min={0} max={80} step={0.5} value={res[m.id] ?? ''} onChange={(e) => setRes((c) => ({ ...c, [m.id]: e.target.value }))} className="h-8 w-16 text-sm" /><span className="text-xs text-muted-foreground">h</span></div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
