import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { editarPunto, type Minuta, type Punto } from '@/lib/minutasApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SELECT } from './EditorPuntos';
import { usePuntoAcciones } from './usePuntoAcciones';

interface Props {
  punto: Punto;
  personas: { id: string; nombre: string }[];
  onActualizada: (minuta: Minuta) => void;
  /** Called after the changes were saved, so the dialog can close. */
  onGuardado?: () => void;
}

/** Editar el punto: título, descripción, responsable, fecha, visibilidad; descartar o restaurar. */
export function VistaGestionar({ punto, personas, onActualizada, onGuardado }: Props) {
  const { enviando, conError, accion } = usePuntoAcciones(punto.id, onActualizada);
  const [titulo, setTitulo] = useState(punto.titulo);
  const [descripcion, setDescripcion] = useState(punto.descripcion ?? '');
  const [responsable, setResponsable] = useState(punto.responsable_cliente ? 'cliente' : punto.responsable?.id ?? '');
  const [fecha, setFecha] = useState(punto.fecha_compromiso ?? '');
  const [visible, setVisible] = useState(punto.visible_cliente);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    setTitulo(punto.titulo);
    setDescripcion(punto.descripcion ?? '');
    setResponsable(punto.responsable_cliente ? 'cliente' : punto.responsable?.id ?? '');
    setFecha(punto.fecha_compromiso ?? '');
    setVisible(punto.visible_cliente);
    setDescartando(false);
    setMotivo('');
  }, [punto]);

  const guardar = async () => {
    const ok = await conError(() => editarPunto(punto.id, {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      responsable_user_id: responsable && responsable !== 'cliente' ? responsable : null,
      responsable_cliente: responsable === 'cliente',
      fecha_compromiso: fecha || null,
      visible_cliente: visible,
    }), 'No se pudieron guardar los cambios');
    if (!ok) return;
    toast.success('Cambios guardados');
    onGuardado?.();
  };

  // Work that moves without a linked task (a call, a meeting) is started by hand.
  const marcarEnCurso = async () => {
    if (!(await accion('iniciar'))) return;
    toast.success('Punto en curso');
    onGuardado?.();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pd-titulo">Título</Label>
        <Input id="pd-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pd-descripcion">Descripción</Label>
        <Textarea id="pd-descripcion" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué pidió el cliente, con el detalle que haga falta." />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pd-responsable">Responsable</Label>
          <select id="pd-responsable" className={SELECT} value={responsable} onChange={(e) => setResponsable(e.target.value)}>
            <option value="">Sin responsable</option>
            {personas.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            <option value="cliente">Cliente</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pd-fecha">{responsable === 'cliente' ? 'Quedó en enviarlo el' : 'Fecha de compromiso'}</Label>
          <Input id="pd-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pd-visible">Visible para el cliente</Label>
          <div className="flex h-10 items-center gap-2">
            <Switch id="pd-visible" checked={visible} onCheckedChange={setVisible} />
            <span className="text-sm text-muted-foreground">{visible ? 'Sí' : 'No, es interno'}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!titulo.trim() || enviando} onClick={guardar}>Guardar cambios</Button>
        {punto.estado === 'pendiente' && !punto.responsable_cliente && (
          <Button variant="outline" disabled={enviando} onClick={marcarEnCurso}>Marcar en curso</Button>
        )}
        {punto.estado === 'descartado' ? (
          <Button variant="outline" disabled={enviando} onClick={() => accion('restaurar')}>Restaurar</Button>
        ) : punto.estado !== 'aprobado' && (
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setDescartando((v) => !v)}>Descartar punto</Button>
        )}
      </div>
      {punto.estado === 'descartado' && punto.motivo_descarte && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">Descartado: {punto.motivo_descarte}</p>
      )}
      {descartando && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <Label htmlFor="pd-motivo">Motivo del descarte</Label>
          <Input id="pd-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el cliente retiró el pedido." />
          <Button variant="destructive" size="sm" disabled={!motivo.trim() || enviando} onClick={() => accion('descartar', { motivo: motivo.trim() })}>
            Confirmar descarte
          </Button>
        </div>
      )}
    </div>
  );
}
