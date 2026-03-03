import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ActivityIndicator } from '@/components/tasks/ActivityIndicator';

interface Screenshot {
  id: string;
  file_path: string;
  thumbnail_path?: string;
  activity_percent: number;
  captured_at: string;
  titulo_tarea?: string;
}

interface ScreenshotTimelineProps {
  screenshots: Screenshot[];
}

export function ScreenshotTimeline({ screenshots }: ScreenshotTimelineProps) {
  const [selected, setSelected] = useState<Screenshot | null>(null);

  if (screenshots.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-4">Sin screenshots</div>;
  }

  const apiBase = (import.meta as any).env?.VITE_API_URL || window.location.origin;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {screenshots.map((ss) => (
          <div
            key={ss.id}
            className="shrink-0 cursor-pointer group"
            onClick={() => setSelected(ss)}
          >
            <div className="w-36 h-24 rounded-md border border-border overflow-hidden bg-muted">
              <img
                src={`${apiBase}${ss.thumbnail_path || ss.file_path}`}
                alt="Screenshot"
                className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
              />
            </div>
            <div className="flex items-center justify-between mt-1 px-0.5">
              <span className="text-[10px] text-muted-foreground">
                {new Date(ss.captured_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <ActivityIndicator percent={ss.activity_percent} size="sm" />
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-4xl w-[95vw]" aria-describedby="ss-detail-desc">
          <DialogTitle className="text-sm">
            {selected?.titulo_tarea || 'Screenshot'} — {selected && new Date(selected.captured_at).toLocaleString('es-ES')}
          </DialogTitle>
          <DialogDescription id="ss-detail-desc" className="sr-only">Vista completa del screenshot</DialogDescription>
          {selected && (
            <div className="rounded-lg overflow-hidden border border-border">
              <img
                src={`${apiBase}${selected.file_path}`}
                alt="Screenshot completo"
                className="w-full"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
