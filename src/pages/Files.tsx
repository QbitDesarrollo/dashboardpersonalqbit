import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Upload,
  Download,
  FileText,
  Image,
  Video,
  File as FileIcon,
  Search,
  Loader2,
  Trash2,
  Files as FilesIcon,
} from 'lucide-react';

interface FileRecord {
  id: string;
  task_id: string | null;
  deliverable_id: string | null;
  nombre_archivo: string;
  url_storage: string;
  subido_por: string | null;
  created_at: string;
  tasks?: { titulo_tarea: string };
}

interface Task {
  id: string;
  titulo_tarea: string;
}

export default function Files() {
  const { profile } = useAuth();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [filesData, tasksRes] = await Promise.all([api.getFiles(), api.getTasks({ limit: 200 })]);
      if (Array.isArray(filesData)) setFiles(filesData as FileRecord[]);
      const tasksList = tasksRes.tasks || [];
      setTasks(tasksList.map((t: { id: string; titulo_tarea: string }) => ({ id: t.id, titulo_tarea: t.titulo_tarea })));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar archivos');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileUrl || !fileName) {
      toast.error('URL y nombre requeridos');
      return;
    }
    setUploading(true);
    try {
      const result: any = await api.createFile({
        task_id: selectedTask || undefined,
        nombre_archivo: fileName,
        url_storage: fileUrl,
      });
      if (result?.error) throw new Error(result.error);
      toast.success('Archivo agregado');
      setDialogOpen(false);
      setSelectedTask('');
      setFileUrl('');
      setFileName('');
      fetchData();
    } catch (error: any) {
      toast.error('Error al agregar archivo', { description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const result: any = await api.deleteFile(id);
      if (result?.error) throw new Error(result.error);
      toast.success('Archivo eliminado');
      fetchData();
    } catch (error: any) {
      toast.error('Error al eliminar', { description: error.message });
    }
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
      return <Image className="h-8 w-8 text-info" />;
    }
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext || '')) {
      return <Video className="h-8 w-8 text-warning" />;
    }
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext || '')) {
      return <FileText className="h-8 w-8 text-destructive" />;
    }
    return <FileIcon className="h-8 w-8 text-muted-foreground" />;
  };

  const filteredFiles = files.filter(f =>
    f.nombre_archivo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.tasks?.titulo_tarea?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Archivos</h2>
          <p className="text-sm text-muted-foreground">Gestiona los archivos del proyecto</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary w-full sm:w-auto">
              <Upload className="h-4 w-4 mr-2" />
              Subir Archivo
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-4 sm:mx-auto" aria-describedby="file-add-desc">
            <DialogHeader>
              <DialogTitle>Agregar Archivo (URL)</DialogTitle>
              <DialogDescription id="file-add-desc">Sube un archivo mediante URL y opcionalmente asócialo a una tarea.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddFile} className="space-y-4">
              <div className="space-y-2">
                <Label>Asociar a Tarea (opcional)</Label>
                <Select value={selectedTask || '__none__'} onValueChange={(v) => setSelectedTask(v === '__none__' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tarea" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin tarea</SelectItem>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.titulo_tarea}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nombre del archivo</Label>
                <Input
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="Ej: documento.pdf"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>URL del archivo</Label>
                <Input
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="https://..."
                  required
                />
              </div>
              <Button type="submit" disabled={uploading}>
                {uploading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Agregar archivo
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card className="glass-card">
        <CardContent className="p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar archivos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Files Grid */}
      {filteredFiles.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 sm:p-12 text-center">
            <FilesIcon className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No hay archivos</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {filteredFiles.map((file) => (
            <Card key={file.id} className="glass-card hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 p-2 bg-muted rounded-lg">
                    {getFileIcon(file.nombre_archivo)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate text-sm">
                      {file.nombre_archivo}
                    </p>
                    {file.tasks && (
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {file.tasks.titulo_tarea}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(file.created_at).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                  >
                    <a href={file.url_storage} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(file.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
