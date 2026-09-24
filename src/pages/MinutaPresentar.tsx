import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { obtenerMinuta, type Minuta } from '@/lib/minutasApi';
import { fechaCorta } from '@/lib/minutas';
import { Button } from '@/components/ui/button';
import { AccionesCliente } from '@/components/minutas/AccionesCliente';
import { PuntoPresentado } from '@/components/minutas/PuntoPresentado';

/** Modo presentación: se recorre la minuta con el cliente, punto por punto, solo con lo que el cliente puede ver. */
export default function MinutaPresentar() {
  const { id = '' } = useParams();
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const [indice, setIndice] = useState(0);

  useEffect(() => { obtenerMinuta(id).then(setMinuta); }, [id]);

  if (!minuta) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const puntos = minuta.items.filter((p) => p.visible_cliente && p.estado !== 'descartado');
  const actual = puntos[Math.min(indice, puntos.length - 1)];

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            {minuta.brand_nombre} · {minuta.codigo} · {fechaCorta(minuta.fecha)} {minuta.fecha.slice(0, 4)}
          </p>
          <p className="truncate text-lg font-semibold">{minuta.titulo}</p>
        </div>
        <Button variant="ghost" asChild>
          <Link to={`/minutas/${minuta.id}`}><X className="h-4 w-4" />Salir de la presentación</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        {actual ? (
          <>
            <p className="font-mono text-sm text-muted-foreground">Punto {puntos.indexOf(actual) + 1} de {puntos.length}</p>
            <PuntoPresentado punto={actual} />
            <AccionesCliente key={actual.id} punto={actual} onActualizada={setMinuta} />
            <nav className="flex items-center justify-between border-t pt-6">
              <Button variant="outline" size="lg" disabled={indice === 0} onClick={() => setIndice((i) => i - 1)}>
                <ChevronLeft className="h-5 w-5" />Anterior
              </Button>
              <Button variant="outline" size="lg" disabled={indice >= puntos.length - 1} onClick={() => setIndice((i) => i + 1)}>
                Siguiente<ChevronRight className="h-5 w-5" />
              </Button>
            </nav>
          </>
        ) : (
          <p className="text-lg text-muted-foreground">Esta minuta no tiene puntos para mostrar al cliente.</p>
        )}
      </main>
    </div>
  );
}
