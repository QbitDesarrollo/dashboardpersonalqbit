import { useState } from 'react';
import * as api from '@/lib/apiClient';
import { mensajeErrorDepartamento, opcionesSiguienteEtapa } from '@/lib/departamentos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const COLORES = [
  ['turquesa', '#14b8a6'], ['celeste', '#38bdf8'], ['ámbar', '#f59e0b'], ['azul', '#3b82f6'],
  ['pizarra', '#64748b'], ['rojo', '#ef4444'], ['naranja', '#f97316'], ['verde', '#22c55e'],
];

interface Props {
  departamento: api.Department | null;
  departamentos: api.Department[];
  onClose: () => void;
  onSaved: () => void;
}

export function DepartamentoDialog({ departamento, departamentos, onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState(departamento?.nombre ?? '');
  const [color, setColor] = useState(departamento?.color ?? '#14b8a6');
  const [siguiente, setSiguiente] = useState(departamento?.next_department_id ?? '');
  const [orden, setOrden] = useState(departamento?.orden ?? Math.max(0, ...departamentos.map(d => d.orden)) + 10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const opciones = opcionesSiguienteEtapa(departamentos, departamento?.id, departamento?.next_department_id);

  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const datos = { nombre: nombre.trim(), color, next_department_id: siguiente || null, orden };
      if (departamento) await api.patchDepartment(departamento.id, datos);
      else await api.createDepartment(datos);
      onSaved();
    } catch (e) {
      setError(mensajeErrorDepartamento(e));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{departamento ? 'Editar departamento' : 'Nuevo departamento'}</DialogTitle>
        <DialogDescription>{departamento ? `Edita la información de ${departamento.nombre}.` : 'Crea una etapa del flujo de producción.'}</DialogDescription>
      </DialogHeader>
      <form onSubmit={guardar} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="departamento-nombre">Nombre</Label>
          <Input id="departamento-nombre" required maxLength={100} value={nombre} onChange={e => setNombre(e.target.value)} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Color</legend>
          <div className="flex flex-wrap gap-3">
            {COLORES.map(([etiqueta, valor]) => <button key={valor} type="button" aria-label={`Color ${etiqueta}`} aria-pressed={color === valor}
              className={`h-7 w-7 rounded-full border-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${color === valor ? 'ring-2 ring-ring ring-offset-2' : 'border-transparent'}`}
              style={{ backgroundColor: valor }} onClick={() => setColor(valor)} />)}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="departamento-siguiente">Siguiente etapa</Label>
          <select id="departamento-siguiente" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={siguiente} onChange={e => setSiguiente(e.target.value)}>
            <option value="">Ninguna</option>
            {opciones.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="departamento-orden">Orden</Label>
          <Input id="departamento-orden" type="number" step={1} required value={orden} onChange={e => setOrden(e.target.valueAsNumber)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving || !nombre.trim() || !Number.isFinite(orden)}>{saving ? 'Guardando…' : departamento ? 'Guardar' : 'Crear'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
