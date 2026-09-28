import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { obtenerMinuta, type Minuta } from '@/lib/minutasApi';
import { PresentacionMinuta } from '@/components/minutas/presentacion/PresentacionMinuta';
import { useAccionesReunion } from '@/components/minutas/presentacion/acciones';

/** Modo presentación: se recorre la minuta con el cliente, punto por punto, solo con lo que el cliente puede ver. */
export default function MinutaPresentar() {
  const { id = '' } = useParams();
  const [minuta, setMinuta] = useState<Minuta | null>(null);
  const acciones = useAccionesReunion(setMinuta);

  useEffect(() => { obtenerMinuta(id).then(setMinuta); }, [id]);

  if (!minuta) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  return <PresentacionMinuta minuta={minuta} acciones={acciones} modo="reunion" salirA={`/minutas/${minuta.id}`} />;
}
