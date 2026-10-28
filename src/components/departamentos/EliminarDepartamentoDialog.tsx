import { useEffect, useState } from 'react';
import { mensajeErrorDepartamento, type DepartamentoResumen } from '@/lib/departamentos';
import { ErrorArchivo, solicitarArchivo, type ReferenciasDepartamento } from './archivoApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogFooter } from '@/components/ui/alert-dialog';

const etiquetas: Record<keyof ReferenciasDepartamento, string> = {
  tareas: 'tareas', historial: 'registros de historial', traspasos: 'traspasos', plantillas: 'plantillas', personas: 'personas', mesas: 'mesas', etapas: 'etapas',
};
interface Props { departamento: DepartamentoResumen; onClose: () => void; onSaved: () => void }

export function EliminarDepartamentoDialog({ departamento: d, onClose, onSaved }: Props) {
  const [referencias, setReferencias] = useState<ReferenciasDepartamento | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const bloqueado = referencias !== null && Object.values(referencias).some(n => n > 0);

  useEffect(() => {
    let vigente = true;
    solicitarArchivo<ReferenciasDepartamento>(d.id, '/referencias').then(datos => {
      if (vigente) setReferencias(datos);
    }).catch(e => { if (vigente) setError(mensajeErrorDepartamento(e)); })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [d.id]);

  async function eliminar() {
    if (saving || loading || !referencias || bloqueado || confirmacion !== d.nombre) return;
    setSaving(true); setError('');
    try {
      await solicitarArchivo(d.id, '', { method: 'DELETE', body: JSON.stringify({ confirmacion }) });
      onSaved();
    } catch (e) {
      setError(mensajeErrorDepartamento(e));
      if (e instanceof ErrorArchivo && e.referencias) setReferencias(e.referencias);
    } finally { setSaving(false); }
  }

  return <AlertDialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
      <AlertDialogHeader>
        <p className="text-xs text-muted-foreground">{d.nombre}</p>
        <AlertDialogTitle>Eliminar definitivamente</AlertDialogTitle>
        <AlertDialogDescription>{bloqueado ? 'No se puede eliminar: este departamento todavía tiene referencias.' : 'Esta acción es permanente. Solo puedes eliminar un departamento archivado sin uso ni historial.'}</AlertDialogDescription>
      </AlertDialogHeader>
      {loading && <p role="status">Comprobando referencias…</p>}
      {bloqueado && referencias && <>
        <ul className="space-y-1 text-sm">{(Object.keys(etiquetas) as (keyof ReferenciasDepartamento)[]).filter(clave => referencias[clave] > 0).map(clave => <li key={clave}>{referencias[clave]} {etiquetas[clave]}</li>)}</ul>
        <p className="text-sm text-muted-foreground">Déjalo archivado: no molesta y conserva los reportes.</p>
      </>}
      {!loading && referencias && !bloqueado && <div className="space-y-2">
        <Label htmlFor="archivo-confirmacion">Escribe {d.nombre} para confirmar</Label>
        <Input id="archivo-confirmacion" autoComplete="off" disabled={saving} value={confirmacion} onChange={e => setConfirmacion(e.target.value)} />
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={saving}>{bloqueado || (!loading && !referencias) ? 'Entendido' : 'Cancelar'}</AlertDialogCancel>
        {!bloqueado && referencias && <Button variant="destructive" disabled={saving || loading || confirmacion !== d.nombre} onClick={() => void eliminar()}>{saving ? 'Eliminando…' : 'Eliminar'}</Button>}
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
