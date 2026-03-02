import { useState, useEffect, useRef } from 'react';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Paperclip, Upload, Trash2, FileText, Image, File, Loader2, ExternalLink, Link2 } from 'lucide-react';
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
  const [addNombre, setAddNombre] = useState('');
  const [addUrl, setAddUrl] = useState('');

  useEffect(() => {
    fetchFiles();
  }, [taskId]);

  const fetchFiles = async () => {
    try {
      const data = await api.getFiles(taskId);
      setFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleAddFile = async (nombre: string, url: string) => {
    if (!nombre || !url) return;
    setUploading(true);
    try {
      const result: any = await api.createFile({
        task_id: taskId,
        nombre_archivo: nombre,
        url_storage: url,
      });
      if (result?.error) throw new Error(result.error);
      toast.success('Archivo agregado');
      fetchFiles();
    } catch (error: any) {
      toast.error('Error al agregar archivo', { description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadFile = async (file: globalThis.File) => {
    setUploading(true);
    try {
      const result: any = await api.uploadFile(taskId, file);
      if (result?.error) throw new Error(result.error);
      toast.success('Archivo subido');
      fetchFiles();
    } catch (error: any) {
      toast.error('Error al subir archivo', { description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (fileId: string) => {
    try {
      const result: any = await api.deleteFile(fileId);
      if (result?.error) throw new Error(result.error);
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

  const FileActions = () => (
    <div className="flex items-center gap-1">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.mp4,.mp3,.ai,.psd,.fig,.sketch"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        Subir
      </Button>
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setAddNombre(''); setAddUrl(''); } }}>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1">
            <Link2 className="h-3 w-3" />
            URL
          </Button>
        </DialogTrigger>
        <DialogContent aria-describedby="taskfile-add-desc">
          <DialogHeader>
            <DialogTitle>Agregar enlace a archivo</DialogTitle>
            <DialogDescription id="taskfile-add-desc">Introduce el nombre y la URL del archivo externo.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddFile(addNombre, addUrl); setDialogOpen(false); setAddNombre(''); setAddUrl(''); }} className="space-y-4">
            <Input placeholder="Nombre del archivo" value={addNombre} onChange={(e) => setAddNombre(e.target.value)} required />
            <Input placeholder="URL (ej: Google Drive, Dropbox)" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} required />
            <Button type="submit" disabled={uploading}>Agregar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );

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
              {canEdit && <FileActions />}
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
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={() => handleDelete(file.id)}
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
        {canEdit && <FileActions />}
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
                  type="button"
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
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(file.id)}
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
