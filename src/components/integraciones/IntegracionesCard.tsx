import { useEffect, useState } from 'react';
import { CalendarDays, FolderOpen, MessageSquare, Plug } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { conectarGoogle, obtenerPermisosGoogle, revocarConexionGoogle, type PermisosGoogle } from './api';

const servicios = [
  { key: 'calendar', nombre: 'Google Calendar', descripcion: 'Ve tus reuniones en Tiusdei', icono: CalendarDays, color: 'text-blue-500' },
  { key: 'drive', nombre: 'Google Drive', descripcion: 'Adjunta archivos de Drive a tus tareas', icono: FolderOpen, color: 'text-green-600' },
  { key: 'chat', nombre: 'Google Chat', descripcion: 'Recibe avisos de tus tareas y reuniones', icono: MessageSquare, color: 'text-primary' },
] as const;

export function IntegracionesCard() {
  const [permisos, setPermisos] = useState<PermisosGoogle | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [revocando, setRevocando] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    obtenerPermisosGoogle().then((datos) => {
      if (vigente) setPermisos(datos);
    }).catch(() => {
      if (vigente) setError('No se pudieron cargar tus integraciones.');
    }).finally(() => {
      if (vigente) setCargando(false);
    });
    return () => { vigente = false; };
  }, [intento]);

  async function revocar() {
    setRevocando(true);
    setError('');
    try {
      setPermisos(await revocarConexionGoogle());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revocar la conexión.');
    } finally {
      setConfirmando(false);
      setRevocando(false);
    }
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Plug className="h-5 w-5" />Integraciones</CardTitle>
      </CardHeader>
      <CardContent>
        {cargando && <p role="status" className="text-sm text-muted-foreground">Cargando integraciones…</p>}
        {error && <p role="alert" className="text-sm text-destructive mb-3">{error}</p>}
        {!cargando && !permisos && <Button variant="outline" onClick={() => setIntento((n) => n + 1)}>Reintentar</Button>}
        {permisos && (
          <ul className="divide-y">
            {servicios.map(({ key, nombre, descripcion, icono: Icono, color }) => {
              const conectado = permisos.conectado && permisos[key];
              const estado = conectado ? 'Conectado' : permisos.conectado ? 'Falta permiso' : 'No conectado';
              const accion = conectado ? 'Revocar' : permisos.conectado ? 'Dar permiso' : 'Conectar';
              return (
                <li key={key} className="flex flex-wrap sm:flex-nowrap items-center gap-3 py-4 first:pt-0 last:pb-0">
                  <span className={`rounded-lg bg-muted p-2 ${color}`}><Icono className="h-5 w-5" aria-hidden="true" /></span>
                  <div className="flex-1 min-w-40">
                    <span className="text-sm font-medium">{nombre}</span>
                    <p className="text-xs text-muted-foreground">{descripcion}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] font-normal ${estado === 'Falta permiso' ? 'text-amber-600 border-amber-500/30 bg-amber-500/10' : ''}`}>{estado}</Badge>
                  <Button
                    variant={conectado ? 'ghost' : permisos.conectado ? 'default' : 'outline'}
                    aria-label={`${accion}: ${nombre}`}
                    disabled={revocando}
                    onClick={conectado ? () => setConfirmando(true) : conectarGoogle}
                  >{accion}</Button>
                </li>
              );
            })}
          </ul>
        )}
        <AlertDialog open={confirmando} onOpenChange={(abierto) => { if (!revocando) setConfirmando(abierto); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Revocar la conexión de Google?</AlertDialogTitle>
              <AlertDialogDescription>
                Se desconectarán Google Calendar, Drive y Chat de Tiusdei. Puedes volver a dar permiso cuando quieras.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={revocando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={revocando} onClick={(e) => { e.preventDefault(); void revocar(); }}>
                {revocando ? 'Revocando…' : 'Revocar conexión'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
