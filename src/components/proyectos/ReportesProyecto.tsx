import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Settings2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SELECT } from '@/components/minutas/EditorPuntos';
import { fechaCorta } from '@/lib/minutas';
import {
  generarReporte, guardarConfigReportes, leerConfigReportes, listarReportes, semanasReportes,
  type ConfigReportes, type ReporteResumen, type Semana,
} from '@/lib/reportesApi';
import { cn } from '@/lib/utils';
import { ESTADO_REPORTE } from './estadosReporte';
import { VisorReporte } from './VisorReporte';

interface Props {
  proyectoId: string;
  personas: { id: string; nombre: string }[];
  /** Report to open right away (from the "your report is ready" email link). */
  reporteInicial?: string;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const VISIBLES = 3;
const rango = (desde: string, hasta: string) => `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
const periodo = (r: ReporteResumen) => `${rango(r.periodo_desde, r.periodo_hasta)} ${r.periodo_hasta.slice(0, 4)}${r.parcial ? ' · en curso' : ''}`;
const etiquetaSemana = (s: Semana) => (s.parcial ? `Esta semana (${rango(s.desde, s.hasta)}, hasta hoy)` : `${rango(s.desde, s.hasta)} ${s.hasta.slice(0, 4)}`);
const estadoAutomatico = (c: ConfigReportes) => (c.activo ? `Automático: ${DIAS[c.dia_entrega - 1].toLowerCase()} a las ${c.hora_entrega}` : 'Automático apagado');

/** Weekly reports of a project, compact: history first; settings and "generate" open on demand. */
export function ReportesProyecto({ proyectoId, personas, reporteInicial }: Props) {
  const [config, setConfig] = useState<ConfigReportes | null>(null);
  const [guardada, setGuardada] = useState<ConfigReportes | null>(null);
  const [reportes, setReportes] = useState<ReporteResumen[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(reporteInicial ?? null);
  const [panel, setPanel] = useState<'configurar' | 'generar' | null>(null);
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [semana, setSemana] = useState('');
  const [todos, setTodos] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargarLista = useCallback(() => {
    listarReportes(proyectoId).then(setReportes).catch(() => setReportes([]));
  }, [proyectoId]);

  useEffect(() => {
    leerConfigReportes(proyectoId).then((c) => { setConfig(c); setGuardada(c); }).catch(() => toast.error('No se pudo cargar la configuración de reportes'));
    cargarLista();
  }, [proyectoId, cargarLista]);

  const alternar = (p: 'configurar' | 'generar') => {
    setPanel((actual) => (actual === p ? null : p));
    if (p === 'generar' && !semanas.length) {
      semanasReportes(proyectoId).then((s) => { setSemanas(s); setSemana(s[0]?.desde ?? ''); }).catch(() => toast.error('No se pudieron cargar las semanas'));
    }
  };

  const cambio = !!config && !!guardada && (config.activo !== guardada.activo || config.dia_entrega !== guardada.dia_entrega || config.hora_entrega !== guardada.hora_entrega);

  const guardar = async () => {
    if (!config) return;
    setOcupado(true);
    try {
      const c = await guardarConfigReportes(proyectoId, { activo: config.activo, dia_entrega: config.dia_entrega, hora_entrega: config.hora_entrega });
      setConfig(c); setGuardada(c); setPanel(null);
      toast.success('Configuración guardada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setOcupado(false);
    }
  };

  const generar = async () => {
    setOcupado(true);
    try {
      const { id } = await generarReporte(proyectoId, semana || undefined);
      setPanel(null);
      setAbierto(id);
      cargarLista();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el reporte');
    } finally {
      setOcupado(false);
    }
  };

  const visibles = reportes ? (todos ? reportes : reportes.slice(0, VISIBLES)) : [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-primary" />Reportes semanales</h2>
            {guardada && <p className="text-xs text-muted-foreground">{estadoAutomatico(guardada)}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant={panel === 'generar' ? 'secondary' : 'outline'} size="sm" onClick={() => alternar('generar')}><Sparkles className="h-4 w-4" />Generar reporte</Button>
            <Button variant={panel === 'configurar' ? 'secondary' : 'ghost'} size="sm" onClick={() => alternar('configurar')}><Settings2 className="h-4 w-4" />Configurar</Button>
          </div>
        </div>

        {panel === 'generar' && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="rep-semana" className="text-xs">Semana</Label>
              <select id="rep-semana" className={SELECT} value={semana} onChange={(e) => setSemana(e.target.value)} disabled={!semanas.length}>
                {semanas.map((s) => <option key={s.desde} value={s.desde}>{etiquetaSemana(s)}</option>)}
              </select>
            </div>
            <Button disabled={ocupado || !semana} onClick={generar}>{ocupado && <Loader2 className="h-4 w-4 animate-spin" />}Generar</Button>
          </div>
        )}

        {panel === 'configurar' && config && (
          <div className="grid items-end gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[auto_1fr_1fr_auto]">
            <div className="flex h-10 items-center gap-2">
              <Switch id="rep-activo" aria-label="Generar reportes automáticamente" checked={config.activo} onCheckedChange={(activo) => setConfig({ ...config, activo })} />
              <Label htmlFor="rep-activo" className="text-sm">Automático</Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-dia" className="text-xs">Día de entrega</Label>
              <select id="rep-dia" className={SELECT} value={config.dia_entrega} onChange={(e) => setConfig({ ...config, dia_entrega: Number(e.target.value) })}>
                {DIAS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-hora" className="text-xs">Hora de entrega</Label>
              <Input id="rep-hora" type="time" value={config.hora_entrega} onChange={(e) => setConfig({ ...config, hora_entrega: e.target.value })} />
            </div>
            <Button disabled={!cambio || ocupado} onClick={guardar}>{ocupado && <Loader2 className="h-4 w-4 animate-spin" />}Guardar</Button>
            <p className="text-xs text-muted-foreground sm:col-span-4">
              Se prepara unas horas antes con la semana anterior y a esa hora te llega un correo para revisarlo.
            </p>
          </div>
        )}

        {reportes === null ? (
          <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : reportes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay reportes.</p>
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {visibles.map((r) => {
                const estado = ESTADO_REPORTE[r.estado];
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{periodo(r)}</p>
                      {r.resumen && <p className="truncate text-xs text-muted-foreground">{r.resumen}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', estado.clase)}>{estado.texto}</span>
                      <Button variant="ghost" size="sm" aria-label={`Ver el reporte ${periodo(r).replace(' · en curso', '')}`} onClick={() => setAbierto(r.id)}>Ver</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {reportes.length > VISIBLES && (
              <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setTodos((v) => !v)}>
                {todos ? 'Ver menos' : `Ver todos (${reportes.length})`}
              </Button>
            )}
          </>
        )}
      </CardContent>

      {abierto && (
        <VisorReporte reporteId={abierto} abierto onOpenChange={(v) => { if (!v) { setAbierto(null); cargarLista(); } }} personas={personas} onCambio={cargarLista} />
      )}
    </Card>
  );
}
