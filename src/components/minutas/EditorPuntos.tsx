import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/** Un punto mientras se escribe la minuta. `responsable`: '' (sin asignar), id de usuario o 'cliente'. */
export interface PuntoBorrador { clave: string; titulo: string; descripcion: string; responsable: string; fecha: string }

interface Props {
  puntos: PuntoBorrador[];
  onChange: (puntos: PuntoBorrador[]) => void;
  personas: { id: string; nombre: string }[];
}

let secuencia = 0;
const nuevaClave = () => `p${Date.now().toString(36)}${(secuencia += 1)}`;

export const SELECT = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** El textarea crece con el texto, sin barra de scroll interna. */
function ajustarAlto(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

export function EditorPuntos({ puntos, onChange, personas }: Props) {
  const [captura, setCaptura] = useState('');

  const agregar = () => {
    const titulo = captura.trim();
    if (!titulo) return;
    onChange([...puntos, { clave: nuevaClave(), titulo, descripcion: '', responsable: '', fecha: '' }]);
    setCaptura('');
  };

  const cambiar = (clave: string, campo: keyof PuntoBorrador, valor: string) =>
    onChange(puntos.map((p) => (p.clave === clave ? { ...p, [campo]: valor } : p)));

  return (
    <div className="space-y-2">
      {puntos.map((p, i) => (
        <div key={p.clave} className="grid grid-cols-[28px_minmax(0,1fr)_32px] gap-2 rounded-lg border bg-card p-3">
          <span className="pt-2 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
          <div className="space-y-2 min-w-0">
            <Input
              aria-label={`Título del punto ${i + 1}`}
              className="font-medium"
              value={p.titulo}
              onChange={(e) => cambiar(p.clave, 'titulo', e.target.value)}
            />
            <Textarea
              aria-label={`Descripción del punto ${i + 1}`}
              placeholder="Descripción (opcional)"
              rows={1}
              className="min-h-[38px] resize-none overflow-hidden"
              value={p.descripcion}
              onChange={(e) => { cambiar(p.clave, 'descripcion', e.target.value); ajustarAlto(e.target); }}
            />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
              <select
                aria-label={`Responsable del punto ${i + 1}`}
                className={SELECT}
                value={p.responsable}
                onChange={(e) => cambiar(p.clave, 'responsable', e.target.value)}
              >
                <option value="">Sin responsable</option>
                {personas.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                <option value="cliente">Cliente</option>
              </select>
              <Input
                type="date"
                aria-label={`Fecha del punto ${i + 1}`}
                value={p.fecha}
                onChange={(e) => cambiar(p.clave, 'fecha', e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            aria-label={`Quitar el punto ${i + 1}`}
            className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground grid place-items-center"
            onClick={() => onChange(puntos.filter((x) => x.clave !== p.clave))}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <label className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-muted-foreground focus-within:border-primary focus-within:text-primary">
        <Plus className="h-4 w-4 shrink-0" />
        <input
          className="flex-1 bg-transparent text-sm text-foreground outline-none"
          placeholder="Escribe un punto y presiona Enter"
          value={captura}
          onChange={(e) => setCaptura(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); agregar(); }
          }}
        />
      </label>
    </div>
  );
}
