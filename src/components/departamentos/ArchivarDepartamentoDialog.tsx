import { useEffect, useState } from 'react';
import { mensajeErrorDepartamento, opcionesSiguienteEtapa, type DepartamentoResumen } from '@/lib/departamentos';
import { solicitarArchivo, type ReferenciasDepartamento } from './archivoApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogFooter } from '@/components/ui/alert-dialog';

interface Props {
  departamento: DepartamentoResumen;
  departamentos: DepartamentoResumen[];
  onClose: () => void;
  onSaved: () => void;
}

export function ArchivarDepartamentoDialog({ departamento: d, departamentos, onClose, onSaved }: Props) {
  const opciones = opcionesSiguienteEtapa(departamentos, d.id);
  const predeterminado = opciones.find(opcion => opcion.id === d.next_department_id)?.id ?? opciones[0]?.id ?? '';
  const [destino, setDestino] = useState(predeterminado);
  const [modo, setModo] = useState<'mover' | 'sin'>(predeterminado ? 'mover' : 'sin');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [referencias, setReferencias] = useState<ReferenciasDepartamento | null>(null);

  useEffect(() => {
    let vigente = true;
    // El resumen cuenta personas activas; el archivo mueve todos los perfiles, incluso inactivos.
    solicitarArchivo<ReferenciasDepartamento>(d.id, '/referencias').then(datos => {
      if (vigente) setReferencias(datos);
    }).catch(e => { if (vigente) setError(mensajeErrorDepartamento(e)); });
    return () => { vigente = false; };
  }, [d.id]);

  async function archivar() {
    if (saving || !referencias || (modo === 'mover' && !destino)) return;
    setSaving(true); setError('');
    try {
      await solicitarArchivo(d.id, '/archivar', { method: 'POST', body: JSON.stringify({ destino_id: modo === 'mover' ? destino : null }) });
      onSaved();
    } catch (e) { setError(mensajeErrorDepartamento(e)); }
    finally { setSaving(false); }
  }

  return <AlertDialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>Archivar {d.nombre}</AlertDialogTitle>
        <AlertDialogDescription>Deja de aparecer al elegir departamento y en el Pipeline. El historial y los reportes se conservan. Puedes restaurarlo.</AlertDialogDescription>
      </AlertDialogHeader>
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="text-sm font-medium mb-4">¿Qué hacemos con lo que está en {d.nombre}?</legend>
        <div className="space-y-3 border rounded-lg p-4">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="radio" name="archivo-modo" checked={modo === 'mover'} disabled={!opciones.length} onChange={() => setModo('mover')} />Mover a otro departamento</label>
          <div className="space-y-2">
            <Label htmlFor="archivo-destino">Departamento de destino</Label>
            <select id="archivo-destino" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" disabled={modo !== 'mover'} value={destino} onChange={e => setDestino(e.target.value)}>
              {!opciones.length && <option value="">No hay otros departamentos activos</option>}
              {opciones.map(opcion => <option key={opcion.id} value={opcion.id}>{opcion.nombre}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="archivo-modo" checked={modo === 'sin'} onChange={() => setModo('sin')} />Dejarlas sin departamento</label>
        {referencias ? <p className="text-xs text-muted-foreground">{d.tareas_abiertas} tareas abiertas · {referencias.personas} personas · {referencias.mesas} mesas</p> : !error && <p role="status" className="text-xs text-muted-foreground">Comprobando elementos…</p>}
        <p className="text-xs text-muted-foreground">Las tareas terminadas se quedan en este departamento.</p>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
        <Button disabled={saving || !referencias || (modo === 'mover' && !destino)} onClick={() => void archivar()}>{saving ? 'Archivando…' : 'Archivar'}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
