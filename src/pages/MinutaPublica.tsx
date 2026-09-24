import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ExternalLink, HardDrive, Link2, Loader2 } from 'lucide-react';
import { obtenerMinutaPublica, type MinutaPublica as Datos, type PuntoPublico } from '@/lib/minutasApi';
import { estadoCliente, fechaCorta } from '@/lib/minutas';
import { TONO } from '@/components/minutas/tonos';
import { cn } from '@/lib/utils';

function Punto({ p }: { p: PuntoPublico }) {
  const estado = estadoCliente(p);
  const cerrado = p.estado === 'completado' || p.estado === 'aprobado';
  return (
    <li aria-label={`Punto ${p.numero}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-slate-200 px-5 py-4 first:border-t-0">
      <span className="font-mono text-sm leading-6 text-slate-400">{p.numero}</span>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-semibold leading-snug text-slate-800">{p.titulo}</p>
          <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', TONO[estado.tono])}>{estado.texto}</span>
        </div>
        {p.descripcion && <p className="whitespace-pre-line text-sm text-slate-600">{p.descripcion}</p>}
        {!cerrado && p.fecha_compromiso && (
          <p className="text-xs text-slate-500">{p.responsable_cliente ? 'Quedaste en enviarlo el ' : 'Compromiso: '}{fechaCorta(p.fecha_compromiso)}</p>
        )}
        {cerrado && (p.resolucion || p.evidencias.length > 0) && (
          <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">{p.responsable_cliente ? 'Qué recibimos' : 'Qué hicimos'}</p>
            {p.resolucion && <p className="whitespace-pre-line text-sm text-slate-700">{p.resolucion}</p>}
            {p.evidencias.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {p.evidencias.map((e) => (
                  <a
                    key={e.url}
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    {e.tipo === 'imagen'
                      ? <img src={e.url} alt={e.nombre} className="h-12 w-16 rounded object-cover" />
                      : <>{e.tipo === 'drive' ? <HardDrive className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}{e.nombre}<ExternalLink className="h-3 w-3 text-slate-400" /></>}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** Lo que ve el cliente por el enlace de la minuta: solo lectura, sin login. */
export default function MinutaPublica() {
  const { token = '' } = useParams();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerMinutaPublica(token).then(setDatos).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo abrir la minuta.'));
  }, [token]);

  // Página pública: siempre en claro, como el tablero del cliente.
  useEffect(() => {
    const oscuro = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    return () => { if (oscuro) document.documentElement.classList.add('dark'); };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-slate-300" />
        <p className="text-slate-600">{error}</p>
        <p className="mt-2 text-sm text-slate-400">Escríbele a tu contacto en la agencia.</p>
      </div>
    );
  }
  if (!datos) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;

  const listos = datos.puntos.filter((p) => p.estado === 'completado' || p.estado === 'aprobado').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <span className="font-bold text-slate-800">Qbit Digital</span>
          <span className="text-xs text-slate-500">Minuta de reunión</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-5 py-8">
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-wide text-slate-500">
            {datos.marca} · {datos.codigo} · {fechaCorta(datos.fecha)} {datos.fecha.slice(0, 4)}
          </p>
          <h1 className="text-2xl font-bold leading-tight text-slate-900">{datos.titulo}</h1>
          <p className="flex items-center gap-1.5 pt-1 text-sm text-slate-600">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />{listos} de {datos.puntos.length} puntos listos
          </p>
        </div>
        {datos.puntos.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {datos.puntos.map((p) => <Punto key={p.numero} p={p} />)}
          </ul>
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">Esta minuta todavía no tiene puntos.</p>
        )}
      </main>
    </div>
  );
}
