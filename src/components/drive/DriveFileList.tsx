import { useState, useEffect } from 'react';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ExternalLink, Trash2, Loader2, FileText, FileSpreadsheet, Image, Film, File, Folder } from 'lucide-react';

interface TaskDriveFile {
  id: string;
  task_id: string;
  drive_file_id: string;
  name: string;
  mime_type: string;
  icon_url: string | null;
  web_view_link: string | null;
  thumbnail_url: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface DriveFileListProps {
  taskId: string;
  canEdit: boolean;
  refreshKey?: number;
}

function getIcon(mimeType: string) {
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  if (mimeType?.includes('document') || mimeType?.includes('word')) return <FileText className="h-4 w-4 text-blue-600" />;
  if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint')) return <FileText className="h-4 w-4 text-yellow-600" />;
  if (mimeType?.includes('image')) return <Image className="h-4 w-4 text-purple-500" />;
  if (mimeType?.includes('video')) return <Film className="h-4 w-4 text-red-500" />;
  if (mimeType?.includes('pdf')) return <FileText className="h-4 w-4 text-red-600" />;
  if (mimeType?.includes('folder')) return <Folder className="h-4 w-4 text-blue-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function DriveFileList({ taskId, canEdit, refreshKey }: DriveFileListProps) {
  const [files, setFiles] = useState<TaskDriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);

  const fetchFiles = async () => {
    try {
      const data = await api.getTaskDriveFiles(taskId);
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [taskId, refreshKey]);

  const handleDetach = async (id: string) => {
    try {
      await api.detachDriveFile(id);
      toast.success('Archivo de Drive desvinculado');
      fetchFiles();
    } catch (e) {
      toast.error('Error al desvincular archivo');
    }
  };

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
        <svg viewBox="0 0 87.3 78" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
          <path d="M6.6 66.85L3.3 61.35 29.65 17.15h13.6z" fill="#0066DA" />
          <path d="M27.5 78h53.8L67.7 56H13.9z" fill="#00AC47" />
          <path d="M57.7 0L44.1 17.15 70.5 61.35H87.3z" fill="#EA4335" />
          <path d="M29.65 17.15L6.6 56h20.9L44.1 17.15z" fill="#00832D" />
          <path d="M57.7 0H44.1l26.4 56h16.8z" fill="#2684FC" />
          <path d="M27.5 78l13.6-22H13.9l-7.3 12.65z" fill="#FFBA00" />
        </svg>
        Archivos de Drive
      </h4>
      <div className="space-y-1.5">
        {files.map(file => (
          <div
            key={file.id}
            className="flex items-center gap-2.5 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 group hover:bg-blue-100/70 dark:hover:bg-blue-950/50 transition-colors"
          >
            {file.icon_url ? (
              <img src={file.icon_url} alt="" className="h-4 w-4 shrink-0" />
            ) : (
              getIcon(file.mime_type)
            )}
            <span className="flex-1 text-sm font-medium truncate">{file.name}</span>
            <div className="flex items-center gap-1 shrink-0">
              {file.web_view_link && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(file.web_view_link!, '_blank'); }}
                  title="Abrir en Drive"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              )}
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDetach(file.id); }}
                  title="Desvincular"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
