import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EstadoTarea, PrioridadTarea } from '@/lib/tareaForm';
import type { TipoEntregable } from './useCatalogosTarea';
import type { TareaFormState } from './useTareaForm';

interface Props {
  form: TareaFormState;
  tipos: TipoEntregable[];
  /** Only tasks on a client board have the date the client sees. */
  conFechaCliente: boolean;
}

/** Priority, status, dates, estimated hours and recurrence. */
export function CamposPlanificacion({ form, tipos, conFechaCliente }: Props) {
  const { valores, cambiar, estimadoAuto, estimadoManual, setEstimadoManual } = form;

  const detalleEstimado = valores.entregables
    .filter((e) => e.tipo_entregable_id)
    .map((e) => {
      const dt = tipos.find((d) => d.id === e.tipo_entregable_id);
      return dt?.minutos_estimados ? `${e.cantidad} × ${dt.nombre} (${dt.minutos_estimados} min)` : null;
    })
    .filter(Boolean)
    .join(' + ');

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="prioridad">Prioridad</Label>
        <Select value={valores.prioridad} onValueChange={(value: PrioridadTarea) => cambiar({ prioridad: value })}>
          <SelectTrigger id="prioridad">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="estado">Estado</Label>
        <Select value={valores.estado} onValueChange={(value: EstadoTarea) => cambiar({ estado: value })}>
          <SelectTrigger id="estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="backlog">Pendiente</SelectItem>
            <SelectItem value="en_proceso">En Proceso</SelectItem>
            <SelectItem value="revision_interna">Revisión interna</SelectItem>
            <SelectItem value="revision_cliente">Revisión cliente</SelectItem>
            <SelectItem value="ajustes">Ajustes</SelectItem>
            <SelectItem value="entregado">Entregado</SelectItem>
            <SelectItem value="bloqueado">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fecha_inicio">Fecha Inicio</Label>
        <Input id="fecha_inicio" type="date" value={valores.fecha_inicio} onChange={(e) => cambiar({ fecha_inicio: e.target.value })} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fecha_entrega">Fecha Entrega <span className="text-destructive font-semibold">*</span></Label>
        <Input id="fecha_entrega" type="date" value={valores.fecha_entrega} onChange={(e) => cambiar({ fecha_entrega: e.target.value })} required />
      </div>

      {conFechaCliente && (
        <div className="space-y-2">
          <Label htmlFor="fecha_cliente">Fecha Cliente <span className="text-xs text-muted-foreground font-normal">(la que ve en su tablero)</span></Label>
          <Input id="fecha_cliente" type="date" value={valores.fecha_cliente} onChange={(e) => cambiar({ fecha_cliente: e.target.value })} />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="estimated_hours">Horas Estimadas</Label>
        <Input
          id="estimated_hours"
          type="number"
          step="0.5"
          min="0"
          placeholder="Ej: 4.5"
          value={valores.estimated_hours}
          onChange={(e) => { setEstimadoManual(true); cambiar({ estimated_hours: e.target.value }); }}
        />
        {estimadoAuto != null && (
          <p className="text-[11px] text-muted-foreground">
            {estimadoManual
              ? <>Por tipo de entregable serían {estimadoAuto} h. <button type="button" className="underline" onClick={() => setEstimadoManual(false)}>Usar ese cálculo</button></>
              : <>Calculado por tipo de entregable ({detalleEstimado}). Puedes editarlo.</>}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="recurrence_type">Recurrencia</Label>
        <Select value={valores.recurrence_type} onValueChange={(value) => cambiar({ recurrence_type: value })}>
          <SelectTrigger id="recurrence_type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Ninguna</SelectItem>
            <SelectItem value="daily">Diaria</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
            <SelectItem value="biweekly">Quincenal</SelectItem>
            <SelectItem value="monthly">Mensual</SelectItem>
            <SelectItem value="custom">Personalizada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {valores.recurrence_type === 'custom' && (
        <div className="space-y-2">
          <Label htmlFor="recurrence_interval">Intervalo (días)</Label>
          <Input
            id="recurrence_interval"
            type="number"
            min="1"
            value={valores.recurrence_interval}
            onChange={(e) => cambiar({ recurrence_interval: parseInt(e.target.value) || 1 })}
          />
        </div>
      )}

      {valores.recurrence_type !== 'none' && (
        <div className="space-y-2">
          <Label htmlFor="recurrence_end_date">Fin Recurrencia (opcional)</Label>
          <Input
            id="recurrence_end_date"
            type="date"
            value={valores.recurrence_end_date}
            onChange={(e) => cambiar({ recurrence_end_date: e.target.value })}
          />
        </div>
      )}
    </>
  );
}
