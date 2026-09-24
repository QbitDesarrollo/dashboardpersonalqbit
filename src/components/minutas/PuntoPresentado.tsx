import { ExternalLink } from 'lucide-react';
import type { Punto } from '@/lib/minutasApi';
import { estadoCliente } from '@/lib/minutas';
import { cn } from '@/lib/utils';
import { TONO } from './tonos';

/** Un punto en pantalla grande, con el lenguaje del cliente: qué pidió, qué se hizo y la evidencia. */
export function PuntoPresentado({ punto }: { punto: Punto }) {
  const estado = estadoCliente(punto);
  const imagenes = punto.evidencias.filter((e) => e.tipo === 'imagen');
  const enlaces = punto.evidencias.filter((e) => e.tipo !== 'imagen');
  return (
    <article className="space-y-6">
      <div className="space-y-3">
        <span className={cn('inline-flex rounded-full px-3 py-1 text-sm font-medium', TONO[estado.tono])}>{estado.texto}</span>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{punto.titulo}</h1>
        {punto.descripcion && <p className="whitespace-pre-line text-xl text-muted-foreground">{punto.descripcion}</p>}
      </div>
      {punto.resolucion && (
        <section className="space-y-2">
          <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{punto.responsable_cliente ? 'Qué llegó' : 'Qué se hizo'}</h2>
          <p className="whitespace-pre-line text-xl">{punto.resolucion}</p>
        </section>
      )}
      {imagenes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {imagenes.map((ev) => (
            <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer">
              <img src={ev.url} alt={ev.nombre} className="w-full rounded-xl border object-contain" />
            </a>
          ))}
        </div>
      )}
      {enlaces.length > 0 && (
        <ul className="space-y-2">
          {enlaces.map((ev) => (
            <li key={ev.id}>
              <a href={ev.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-lg font-medium text-primary hover:underline">
                {ev.nombre}<ExternalLink className="h-4 w-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {punto.notas.length > 0 && (
        <ul className="space-y-2 border-l-4 border-amber-300 pl-4 text-lg">
          {punto.notas.map((n) => (
            <li key={n.id}>
              <span className="font-medium">{n.tipo === 'ajuste' ? 'Ajuste pedido' : 'Nota'}:</span> {n.texto}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
