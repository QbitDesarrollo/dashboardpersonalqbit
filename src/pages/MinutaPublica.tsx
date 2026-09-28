import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link2Off, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { EntradaCliente } from '@/components/minutas/enlace/EntradaCliente';
import { PresentacionMinuta } from '@/components/minutas/presentacion/PresentacionMinuta';
import type { AccionesPresentacion } from '@/components/minutas/presentacion/acciones';
import {
  ErrorEnlace, aprobarPunto, comentarPunto, nombreRecordado, pedirAjustePunto, sesionGuardada, verMinuta, type MinutaCliente,
} from '@/lib/minutaPublicaApi';

type Estado = { fase: 'cargando' } | { fase: 'entrada' } | { fase: 'no_disponible' } | { fase: 'minuta'; sesion: string; minuta: MinutaCliente };

/** The minuta the client opens from the link: code and name first, then the same presentation as in meetings. */
export default function MinutaPublica() {
  const { token = '' } = useParams();
  const [estado, setEstado] = useState<Estado>(() => (sesionGuardada.leer(token) ? { fase: 'cargando' } : { fase: 'entrada' }));
  const [enviando, setEnviando] = useState(false);

  const fallo = useCallback((e: unknown) => {
    if (e instanceof ErrorEnlace && e.status === 401) { sesionGuardada.borrar(token); setEstado({ fase: 'entrada' }); return; }
    if (e instanceof ErrorEnlace && e.status === 404) { sesionGuardada.borrar(token); setEstado({ fase: 'no_disponible' }); return; }
    toast.error(e instanceof Error ? e.message : 'Algo falló. Intenta de nuevo.');
  }, [token]);

  const cargar = useCallback(async (sesion: string) => {
    try { setEstado({ fase: 'minuta', sesion, minuta: await verMinuta(token, sesion) }); } catch (e) { fallo(e); }
  }, [token, fallo]);

  useEffect(() => {
    const sesion = sesionGuardada.leer(token);
    if (sesion) void cargar(sesion);
  }, [token, cargar]);

  const sesion = estado.fase === 'minuta' ? estado.sesion : '';
  const actuar = async (fn: () => Promise<MinutaCliente>) => {
    setEnviando(true);
    try { const minuta = await fn(); setEstado({ fase: 'minuta', sesion, minuta }); return true; } catch (e) { fallo(e); return false; } finally { setEnviando(false); }
  };
  const acciones: AccionesPresentacion = {
    enviando,
    aprobar: (id) => actuar(() => aprobarPunto(token, sesion, id)),
    pedirAjuste: (id, motivo) => actuar(() => pedirAjustePunto(token, sesion, id, motivo)),
    comentar: (id, texto) => actuar(() => comentarPunto(token, sesion, id, texto)),
  };

  if (estado.fase === 'cargando') {
    return <div className="grid min-h-[100svh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (estado.fase === 'no_disponible') {
    return (
      <div className="grid min-h-[100svh] place-items-center bg-muted/40 px-4">
        <div className="max-w-sm space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm">
          <Link2Off className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm">Este enlace ya no está disponible. Pídele uno nuevo a tu contacto en Qbit.</p>
        </div>
      </div>
    );
  }
  if (estado.fase === 'entrada') {
    return (
      <EntradaCliente
        token={token}
        nombreInicial={nombreRecordado.leer(token)}
        onNoDisponible={() => setEstado({ fase: 'no_disponible' })}
        onEntrar={(nueva, nombre) => { sesionGuardada.guardar(token, nueva); nombreRecordado.guardar(token, nombre); void cargar(nueva); }}
      />
    );
  }
  return <PresentacionMinuta minuta={estado.minuta} acciones={acciones} modo="cliente" />;
}
