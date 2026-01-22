import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { Paperclip, Upload, Trash2, FileText, Image, File, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskFile {
  id: string;
  nombre_archivo: string;
  url_storage: string;
  created_at: string;
}

interface TaskFilesProps {
  taskId: string;
  canEdit: boolean;
  compact?: boolean;
}

export function TaskFiles({ taskId, canEdit, compact = false }: TaskFilesProps) {
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, [taskId]);

  const fetchFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('id, nombre_archivo, url_storage, created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${taskId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('task-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('task-files')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from('files')
        .insert({
          task_id: taskId,
          nombre_archivo: file.name,
          url_storage: urlData.publicUrl,
        });

      if (dbError) throw dbError;

      toast.success('Archivo subido correctamente');
      fetchFiles();
    } catch (error: any) {
      toast.error('Error al subir archivo', { description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId: string, urlStorage: string) => {
    try {
      // Extract path from URL
      const path = urlStorage.split('/task-files/')[1];
      if (path) {
        await supabase.storage.from('task-files').remove([path]);
      }

      const { error } = await supabase
        .from('files')
        .delete()
        .eq('id', fileId);

      if (error) throw error;

      toast.success('Archivo eliminado');
      fetchFiles();
    } catch (error: any) {
      toast.error('Error al eliminar', { description: error.message });
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
      return <Image className="h-4 w-4 text-info" />;
    }
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext || '')) {
      return <FileText className="h-4 w-4 text-warning" />;
    }
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-1 px-2",
              files.length > 0 && "text-primary"
            )}
          >
            <Paperclip className="h-4 w-4" />
            {files.length > 0 && <span className="text-xs">{files.length}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Archivos</span>
              {canEdit && (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                  <Button variant="ghost" size="sm" className="h-7 gap-1" asChild>
                    <span>
                      {uploading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      Subir
                    </span>
                  </Button>
                </label>
              )}
            </div>
            {files.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Sin archivos</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 p-2 rounded bg-muted/50 group"
                  >
                    {getFileIcon(file.nombre_archivo)}
                    <a
                      href={file.url_storage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-xs truncate hover:text-primary"
                    >
                      {file.nombre_archivo}
                    </a>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={() => handleDelete(file.id, file.url_storage)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">Archivos Adjuntos</h4>
        {canEdit && (
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <Button variant="outline" size="sm" className="gap-1" asChild>
              <span>
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Subir Archivo
              </span>
            </Button>
          </label>
        )}
      </div>
      
      {files.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm bg-muted/30 rounded-lg">
          <Paperclip className="h-6 w-6 mx-auto mb-2 opacity-50" />
          No hay archivos adjuntos
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group hover:bg-muted/70 transition-colors"
            >
              {getFileIcon(file.nombre_archivo)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.nombre_archivo}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(file.created_at).toLocaleDateString('es-ES')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  asChild
                >
                  <a href={file.url_storage} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(file.id, file.url_storage)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
