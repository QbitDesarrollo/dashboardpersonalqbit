import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EntregableForm } from '@/lib/tareaForm';
import type { TipoEntregable } from './useCatalogosTarea';
import type { TareaFormState } from './useTareaForm';

/** Deliverable types with their quantity. At least one is mandatory. */
export function CamposEntregables({ form, tipos }: { form: TareaFormState; tipos: TipoEntregable[] }) {
  const { valores, cambiar } = form;
  const actualizar = (idx: number, parcial: Partial<EntregableForm>) =>
    cambiar({ entregables: valores.entregables.map((e, i) => (i === idx ? { ...e, ...parcial } : e)) });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Tipos de Entregable <span className="text-destructive font-semibold">*</span></Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => cambiar({ entregables: [...valores.entregables, { tipo_entregable_id: '', cantidad: 1 }] })}
        >
          <Plus className="h-3 w-3 mr-1" />
          Agregar
        </Button>
      </div>
      {valores.entregables.map((ent, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="flex-1">
            <Select
              value={ent.tipo_entregable_id || '__none__'}
              onValueChange={(value) => actualizar(idx, { tipo_entregable_id: value === '__none__' ? '' : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin tipo</SelectItem>
                {tipos.map((dt) => <SelectItem key={dt.id} value={dt.id}>{dt.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-20">
            <Input
              type="number"
              min={1}
              value={ent.cantidad}
              onChange={(e) => actualizar(idx, { cantidad: parseInt(e.target.value) || 1 })}
              placeholder="Cant."
            />
          </div>
          {valores.entregables.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Quitar tipo de entregable"
              className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
              onClick={() => cambiar({ entregables: valores.entregables.filter((_, i) => i !== idx) })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
