import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SELECT } from '@/components/minutas/EditorPuntos';
import { SelectorLider } from './SelectorLider';

interface Props {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  marcas: { id: string; nombre: string }[];
  personas: { id: string; nombre: string }[];
  onCreado: () => void;
}

/** New project: brand, name and its leader (required), plus optional dates. */
export function NuevoProyectoDialog({ abierto, onOpenChange, marcas, personas, onCreado }: Props) {
  const [marca, setMarca] = useState('');
  const [nombre, setNombre] = useState('');
  const [lider, setLider] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [creando, setCreando] = useState(false);
  const listo = !!marca && !!nombre.trim() && !!lider;

  const crear = async () => {
    if (!listo) return;
    setCreando(true);
    try {
      await api.createProject({ brand_id: marca, nombre: nombre.trim(), lider_user_id: lider, fecha_inicio: inicio || undefined, fecha_fin: fin || undefined });
      toast.success('Proyecto creado');
      setMarca(''); setNombre(''); setLider(''); setInicio(''); setFin('');
      onOpenChange(false);
      onCreado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear el proyecto');
    } finally {
      setCreando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
          <DialogDescription>Agrupa las tareas de un cliente en un proyecto. El líder recibe y aprueba sus reportes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="np-marca" className="text-xs">Cliente / Marca *</Label>
            <select id="np-marca" className={SELECT} value={marca} onChange={(e) => setMarca(e.target.value)}>
              <option value="" disabled>Elige la marca</option>
              {marcas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-nombre" className="text-xs">Nombre del proyecto *</Label>
            <Input id="np-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Campaña Día del Padre 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-lider" className="text-xs">Líder del proyecto *</Label>
            <SelectorLider id="np-lider" personas={personas} value={lider} onChange={setLider} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="np-inicio" className="text-xs">Inicio</Label><Input id="np-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="np-fin" className="text-xs">Entrega objetivo</Label><Input id="np-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={crear} disabled={creando || !listo}>{creando && <Loader2 className="h-4 w-4 animate-spin" />}Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
