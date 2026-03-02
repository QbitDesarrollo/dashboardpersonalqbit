import { useState, useRef, useCallback } from 'react';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Upload, X, FileText, Image, File, Loader2, Paperclip, Link2, ExternalLink, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface UploadedFile {
  id: string;
  nombre_archivo: string;
  url_storage: string;
}

interface FileUploaderProps {
  taskId: string | null;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  canEdit?: boolean;
}

interface UploadingItem {
  tempId: string;
  name: string;
  progress: number;
}

const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.mp4,.mp3,.ai,.psd,.fig,.sketch';

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
    return <Image className="h-4 w-4 text-blue-500 shrink-0" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext || '')) {
    return <FileText className="h-4 w-4 text-amber-500 shrink-0" />;
  }
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function FileUploader({ taskId, files, onFilesChange, canEdit = true }: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlName, setUrlName] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);

  const handleSelectFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    const fileArr = Array.from(selected);
    const items: UploadingItem[] = fileArr.map((f, i) => ({
      tempId: `up_${Date.now()}_${i}`,
      name: f.name,
      progress: 0,
    }));
    setUploading((prev) => [...prev, ...items]);

    let currentFiles = [...files];
    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      const tempId = items[i].tempId;
      try {
        const result = await api.uploadFile(taskId, file, undefined, (pct) => {
          setUploading((prev) => prev.map((u) => (u.tempId === tempId ? { ...u, progress: pct } : u)));
        });
        setUploading((prev) => prev.filter((u) => u.tempId !== tempId));
        const newFile = { id: result.id, nombre_archivo: result.nombre_archivo, url_storage: result.url_storage };
        currentFiles = [...currentFiles, newFile];
        onFilesChange(currentFiles);
      } catch (err: any) {
        toast.error(`Error subiendo ${file.name}`, { description: err.message });
        setUploading((prev) => prev.filter((u) => u.tempId !== tempId));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [taskId, files, onFilesChange]);

  const handleAddUrl = async () => {
    if (!urlName || !urlValue) return;
    setAddingUrl(true);
    try {
      const payload: any = { nombre_archivo: urlName, url_storage: urlValue };
      if (taskId) payload.task_id = taskId;
      const result: any = await api.createFile(payload);
      if (result?.error) throw new Error(result.error);
      onFilesChange([...files, { id: result.id, nombre_archivo: result.nombre_archivo, url_storage: result.url_storage }]);
      toast.success('Enlace agregado');
      setUrlName('');
      setUrlValue('');
      setShowUrlInput(false);
    } catch (err: any) {
      toast.error('Error', { description: err.message });
    } finally {
      setAddingUrl(false);
    }
  };

  const handleRemove = async (fileId: string) => {
    try {
      await api.deleteFile(fileId);
      onFilesChange(files.filter((f) => f.id !== fileId));
      toast.success('Archivo eliminado');
    } catch (err: any) {
      toast.error('Error al eliminar', { description: err.message });
    }
  };

  const allItems = [
    ...files.map((f) => ({ type: 'done' as const, ...f })),
    ...uploading.map((u) => ({ type: 'uploading' as const, id: u.tempId, nombre_archivo: u.name, url_storage: '', progress: u.progress })),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" />
          Archivos Adjuntos
          {files.length > 0 && <span className="text-xs bg-primary/10 text-primary rounded-full px-1.5">{files.length}</span>}
        </h4>
        {canEdit && (
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept={ACCEPT}
              onChange={handleSelectFiles}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3 w-3" />
              Subir
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setShowUrlInput(!showUrlInput)}
            >
              <Link2 className="h-3 w-3" />
              URL
            </Button>
          </div>
        )}
      </div>

      {showUrlInput && (
        <div className="flex gap-2 items-end">
          <Input
            placeholder="Nombre"
            value={urlName}
            onChange={(e) => setUrlName(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          <Input
            placeholder="https://..."
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          <Button type="button" size="sm" className="h-8" disabled={addingUrl || !urlName || !urlValue} onClick={handleAddUrl}>
            {addingUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => { setShowUrlInput(false); setUrlName(''); setUrlValue(''); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {allItems.length === 0 ? (
        <div
          className="text-center py-3 text-muted-foreground text-xs bg-muted/30 rounded-lg border border-dashed cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => canEdit && fileInputRef.current?.click()}
        >
          Haz clic para adjuntar archivos
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {allItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 p-2 rounded-md bg-muted/50 group text-sm"
            >
              {item.type === 'uploading' ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              ) : (
                getFileIcon(item.nombre_archivo)
              )}

              <div className="flex-1 min-w-0">
                {item.type === 'done' && item.url_storage ? (
                  <a href={item.url_storage} target="_blank" rel="noopener noreferrer" className="text-xs truncate hover:text-primary block">
                    {item.nombre_archivo}
                  </a>
                ) : (
                  <span className="text-xs truncate block">{item.nombre_archivo}</span>
                )}
                {item.type === 'uploading' && (
                  <Progress value={item.progress} className="h-1 mt-1" />
                )}
              </div>

              {item.type === 'done' && item.url_storage && (
                <a href={item.url_storage} target="_blank" rel="noopener noreferrer" className="shrink-0 opacity-0 group-hover:opacity-100">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                </a>
              )}

              {canEdit && item.type === 'done' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={() => handleRemove(item.id)}
                >
                  <X className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
