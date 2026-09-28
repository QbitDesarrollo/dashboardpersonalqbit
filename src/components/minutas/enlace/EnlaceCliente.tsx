import { useEffect, useState } from 'react';
import { Copy, KeyRound, Link2, Loader2, Power, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { accionEnlace, leerEnlace, type EnvioMinuta, type EstadoEnlace } from '@/lib/minutaEnlaceApi';
import { cn } from '@/lib/utils';

interface Props {
  minutaId: string;
  /** Changes after a send so the card reloads its history. */
  version: number;
  onEnviar: () => void;
}

const cuando = (iso: string) => new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' });
const enumerar = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0] ?? '');
const textoEnvio = (e: EnvioMinuta) => (e.medio === 'correo'
  ? `Por correo a ${enumerar(e.para.map((p) => p.nombre))} · ${e.enviado_por ?? 'Tiusdei'}`
  : `Mensaje copiado por ${e.enviado_por ?? 'alguien del equipo'}${e.para.length ? ` para ${enumerar(e.para.map((p) => p.nombre))}` : ''}`);

/** The client link of a minuta: its state, link and code to copy, on/off, new code, who came in and what was sent. */
export function EnlaceCliente({ minutaId, version, onEnviar }: Props) {
  const [estado, setEstado] = useState<EstadoEnlace | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vigente = true;
    leerEnlace(minutaId).then((e) => { if (vigente) setEstado(e); }).catch(() => toast.error('No se pudo cargar el enlace para el cliente'));
    return () => { vigente = false; };
  }, [minutaId, version]);

  const accion = async (a: 'activar' | 'apagar' | 'cambiar_codigo') => {
    if (a === 'cambiar_codigo' && !window.confirm('¿Cambiar el código? Quienes ya entraron tendrán que usar el nuevo.')) return;
    setOcupado(true);
    try { setEstado(await accionEnlace(minutaId, a)); } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo actualizar el enlace'); } finally { setOcupado(false); }
  };
  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success('Copiado'); } catch { toast.error('No se pudo copiar'); }
  };

  const enviar = <Button size="sm" onClick={onEnviar}><Send className="h-4 w-4" />Enviar al cliente</Button>;

  return (
    <Card><CardContent className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4 text-primary" />Enlace para el cliente</h2>
        {estado?.url && (
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', estado.activo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
            {estado.activo ? 'Activo' : 'Apagado'}
          </span>
        )}
      </div>

      {!estado ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : !estado.url ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Todavía no se ha compartido con el cliente.</p>
          {enviar}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{estado.url}</span>
              <Button variant="ghost" size="sm" aria-label="Copiar enlace" onClick={() => copiar(estado.url!)}><Copy className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm font-semibold tracking-[0.2em]">{estado.codigo}</span>
              <Button variant="ghost" size="sm" aria-label="Copiar código" onClick={() => copiar(estado.codigo!)}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          {estado.bloqueado_hasta && (
            <p className="text-xs text-amber-700 dark:text-amber-400">Bloqueado por intentos hasta las {hora(estado.bloqueado_hasta)}. Si fue el cliente, cámbiale el código.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {enviar}
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => accion(estado.activo ? 'apagar' : 'activar')}>
              <Power className="h-4 w-4" />{estado.activo ? 'Apagar enlace' : 'Prender enlace'}
            </Button>
            <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => accion('cambiar_codigo')}><RefreshCw className="h-4 w-4" />Cambiar código</Button>
          </div>
          {(estado.accesos.length > 0 || estado.envios.length > 0) && (
            <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
              {estado.envios.slice(-5).reverse().map((e) => <li key={e.id}>{textoEnvio(e)} · {cuando(e.enviado_en)}</li>)}
              {estado.accesos.slice(0, 5).map((a, i) => <li key={`${a.nombre}-${i}`}>{a.nombre} entró · {cuando(a.entro_en)}</li>)}
            </ul>
          )}
        </>
      )}
    </CardContent></Card>
  );
}
