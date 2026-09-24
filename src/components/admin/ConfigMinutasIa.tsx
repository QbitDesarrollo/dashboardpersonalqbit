import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { saludIa, type SaludIa } from '@/lib/minutasIaApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface Props {
  desks: { id: string; nombre: string; activo: boolean }[];
  ajustes: { ia_minutas_desk_ids?: string | null; ia_minutas_limite_diario?: string | null };
  onGuardado: () => void;
}

/** Admin → Config: which desks can draft minutas with AI (Codex) and how many per person a day. */
export function ConfigMinutasIa({ desks, ajustes, onGuardado }: Props) {
  const activas = desks.filter((d) => d.activo);
  const [elegidas, setElegidas] = useState(() => new Set((ajustes.ia_minutas_desk_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean)));
  const [limite, setLimite] = useState(ajustes.ia_minutas_limite_diario || '10');
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [salud, setSalud] = useState<SaludIa | null>(null);

  const alternar = (id: string, activa: boolean) =>
    setElegidas((prev) => { const s = new Set(prev); if (activa) s.add(id); else s.delete(id); return s; });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const r: { error?: string } = await api.patchSiteSettings({
        ia_minutas_desk_ids: activas.filter((d) => elegidas.has(d.id)).map((d) => d.id).join(','),
        ia_minutas_limite_diario: String(limite).trim(),
      });
      if (r?.error) throw new Error(r.error);
      toast.success('Minutas con IA: configuración guardada');
      onGuardado();
    } catch (err) {
      toast.error('No se pudo guardar', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    try { setSalud(await saludIa()); } catch (err) { setSalud({ listo: false, detalle: err instanceof Error ? err.message : 'Sin respuesta' }); } finally { setProbando(false); }
  };

  return (
    <Card className="glass-card max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Minutas con IA
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Arma el borrador de una minuta desde la transcripción de la reunión, con Codex en el servidor. La transcripción no se guarda.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base">Mesas que pueden usarla</Label>
            <p className="text-xs text-muted-foreground">Solo los miembros de estas mesas ven el botón «Generar con IA».</p>
            <div className="flex flex-col gap-3">
              {activas.map((desk) => (
                <div key={desk.id} className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">{desk.nombre}</span>
                  <Switch aria-label={desk.nombre} checked={elegidas.has(desk.id)} onCheckedChange={(v) => alternar(desk.id, v)} />
                </div>
              ))}
            </div>
            {elegidas.size === 0 && <p className="text-sm text-amber-600">Nadie puede usarla hasta que elijas al menos una mesa.</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ia-limite" className="text-base">Minutas por persona al día</Label>
            <Input id="ia-limite" type="number" min={0} max={100} className="w-28" value={limite} onChange={(e) => setLimite(e.target.value)} />
            <p className="text-xs text-muted-foreground">Los intentos que fallan no cuentan.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={guardando}>{guardando && <Loader2 className="h-4 w-4 animate-spin" />}Guardar</Button>
            <Button type="button" variant="outline" disabled={probando} onClick={probar}>
              {probando && <Loader2 className="h-4 w-4 animate-spin" />}Probar conexión
            </Button>
            {salud && (
              <span className={cn('text-sm', salud.listo ? 'text-primary' : 'text-destructive')}>
                {salud.listo ? `Codex está listo · ${salud.detalle}` : `Codex no está listo · ${salud.detalle}`}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
