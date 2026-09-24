import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface Props {
  ajustes: { gemini_enabled?: string | null };
  onGuardado: () => void;
}

/** Admin → Config → IA: turns the Gemini assistant on or off for everyone. */
export function ConfigGemini({ ajustes, onGuardado }: Props) {
  const [habilitado, setHabilitado] = useState(ajustes.gemini_enabled === 'true');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.patchSiteSettings({ gemini_enabled: String(habilitado) });
      toast.success('Configuración de Gemini guardada');
      onGuardado();
    } catch (err) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card className="glass-card max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Gemini AI
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Asistente de inteligencia artificial integrado con contexto de tareas y proyectos.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Sparkles className={cn('h-5 w-5', habilitado ? 'text-purple-500' : 'text-muted-foreground')} />
              <div>
                <p className="font-medium">Gemini AI habilitado</p>
                <p className="text-xs text-muted-foreground">
                  {habilitado
                    ? 'Los usuarios verán el botón de Gemini y podrán interactuar con el asistente AI'
                    : 'El asistente Gemini está oculto para todos los usuarios'}
                </p>
              </div>
            </div>
            <Switch aria-label="Gemini AI habilitado" checked={habilitado} onCheckedChange={setHabilitado} />
          </div>
          <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
            <p className="text-sm text-muted-foreground"><strong>Funcionalidades:</strong></p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Chat conversacional con contexto de tus tareas y proyectos</li>
              <li>Resúmenes automáticos de tareas, comentarios y sprints</li>
              <li>Historial de conversaciones por usuario</li>
            </ul>
          </div>
          <div className="rounded-lg border p-4 bg-muted/30">
            <p className="text-sm text-muted-foreground">
              <strong>Nota:</strong> Gemini AI utiliza la API de Google Gemini.
              La clave API se configura en el servidor. Contacta al administrador del sistema si necesitas actualizar la clave.
            </p>
          </div>
          <Button type="submit" disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Guardar configuración de Gemini
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
