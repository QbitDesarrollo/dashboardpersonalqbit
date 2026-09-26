import { useState } from 'react';
import { Loader2, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SelectorEquipo } from '@/components/minutas/SelectorEquipo';
import type { Reporte } from '@/lib/reportesApi';

interface Props {
  reporte: Reporte;
  personas: { id: string; nombre: string }[];
  ocupado: boolean;
  onRegenerar: (indicaciones: string) => void;
  onAprobar: () => void;
  onEnviar: (para: string[], cc: string[]) => Promise<boolean>;
}

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Right panel of the report viewer: regenerate and approve a draft; send an approved report. */
export function AccionesReporte({ reporte, personas, ocupado, onRegenerar, onAprobar, onEnviar }: Props) {
  const [indicaciones, setIndicaciones] = useState('');
  const [para, setPara] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const nombres = (ids: string[]) => ids.map((id) => personas.find((p) => p.id === id)?.nombre ?? 'Alguien').join(', ');
  const editable = reporte.estado === 'borrador' || reporte.estado === 'fallido';

  const enviar = async () => {
    if (await onEnviar(para, cc.filter((id) => !para.includes(id)))) { setPara([]); setCc([]); }
  };

  return (
    <div className="space-y-5">
      {reporte.error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{reporte.error}</p>}

      {editable && (
        <div className="space-y-2">
          <Label htmlFor="rep-indicaciones">Indicaciones para la IA (opcional)</Label>
          <Textarea
            id="rep-indicaciones" rows={3} maxLength={500} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)}
            placeholder="Ej.: resalta los atrasos, menos técnico, más corto."
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={ocupado} onClick={() => onRegenerar(indicaciones.trim())}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {reporte.contenido ? 'Regenerar' : 'Volver a generar'}
            </Button>
            {reporte.estado === 'borrador' && (
              <Button disabled={ocupado} onClick={onAprobar}><ShieldCheck className="h-4 w-4" />Aprobar</Button>
            )}
          </div>
          {reporte.estado === 'borrador' && (
            <p className="text-xs text-muted-foreground">Al aprobarlo queda fijo: ya no se regenera y se puede enviar.</p>
          )}
        </div>
      )}

      {reporte.estado === 'aprobado' && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Aprobado por {reporte.aprobado_por_nombre}</p>
          <SelectorEquipo titulo="Para" personas={personas} seleccionados={para} onChange={setPara} />
          <SelectorEquipo titulo="Con copia" personas={personas.filter((p) => !para.includes(p.id))} seleccionados={cc} onChange={setCc} />
          <Button className="w-full" disabled={ocupado || para.length === 0} onClick={enviar}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar reporte
          </Button>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Envíos</p>
            {reporte.envios.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todavía no se ha enviado.</p>
            ) : (
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {reporte.envios.map((e) => (
                  <li key={e.id} className="rounded-md bg-muted/50 px-2.5 py-1.5">
                    <span className="text-foreground">Para {nombres(e.para)}{e.cc.length > 0 && ` · copia ${nombres(e.cc)}`}</span>
                    <br />{fechaHora(e.enviado_en)}{e.enviado_por && ` · por ${e.enviado_por}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
