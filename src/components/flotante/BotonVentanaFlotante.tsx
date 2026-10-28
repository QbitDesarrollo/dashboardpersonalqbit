import { useState } from 'react';
import { PictureInPicture2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { guardarPreferencia, leerPreferencia } from '@/lib/ventanaFlotante';
import { abrirVentanaFlotante } from './useVentanaFlotante';

export function BotonVentanaFlotante() {
  const [abierto, setAbierto] = useState(false);
  const [automatica, setAutomatica] = useState(() => {
    try { return leerPreferencia(localStorage); } catch { return true; }
  });
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="ml-1 h-9 w-8 shrink-0" aria-label="Abrir ventana flotante" title="Abrir ventana flotante">
          <PictureInPicture2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <h2 className="text-sm font-semibold">Ventana flotante</h2>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="pip-auto" className="text-sm">Abrir al iniciar una tarea</label>
          <Switch id="pip-auto" checked={automatica} onCheckedChange={value => {
            setAutomatica(value);
            try { guardarPreferencia(localStorage, value); } catch { /* Preferencia en memoria. */ }
          }} />
        </div>
        <p className="text-xs text-muted-foreground">{automatica ? 'Activado' : 'Desactivado'}</p>
        <p className="text-xs text-muted-foreground">Viene activado por defecto. Puedes apagarlo cuando quieras.</p>
        <p className="text-xs text-muted-foreground">Se abre desde tu clic en ▶ y permanece sobre otras aplicaciones.</p>
        <Button className="w-full" onClick={() => { void abrirVentanaFlotante(); setAbierto(false); }}>Abrir ahora</Button>
      </PopoverContent>
    </Popover>
  );
}
