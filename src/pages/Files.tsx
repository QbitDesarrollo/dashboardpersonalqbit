import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [filesRes, tasksRes] = await Promise.all([
        supabase.from('files').select('*, tasks (titulo_tarea)').order('created_at', { ascending: false }),
        supabase.from('tasks').select('id, titulo_tarea'),
      ]);

      if (filesRes.data) setFiles(filesRes.data as FileRecord[]);
      if (tasksRes.data) setTasks(tasksRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar archivos');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile?.id}/${Date.now()}-${file.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('task-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('task-files')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('files').insert({
        task_id: selectedTask || null,
        nombre_archivo: file.name,
        url_storage: urlData.publicUrl,
        subido_por: profile?.id,
      });

      if (dbError) throw dbError;

      toast.success('Archivo subido correctamente');
      setDialogOpen(false);
      setSelectedTask('');
      fetchData();
    } catch (error: any) {
      toast.error('Error al subir archivo', { description: error.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (id: string, url: string) => {
    try {
      // Extract file path from URL
      const urlParts = url.split('/task-files/');
      const filePath = urlParts[1];

      if (filePath) {
        await supabase.storage.from('task-files').remove([filePath]);
      }

      const { error } = await supabase.from('files').delete().eq('id', id);
      if (error) throw error;

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
          <DialogContent className="mx-4 sm:mx-auto">
            <DialogHeader>
              <DialogTitle>Subir Archivo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Asociar a Tarea (opcional)</Label>
                <Select value={selectedTask} onValueChange={setSelectedTask}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tarea" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin tarea</SelectItem>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.titulo_tarea}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Archivo</Label>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleUpload}
                    className="hidden"
                    id="file-upload"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="file-upload"
                    className={cn(
                      "cursor-pointer flex flex-col items-center gap-2",
                      uploading && "pointer-events-none opacity-50"
                    )}
                  >
                    {uploading ? (
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    ) : (
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {uploading ? 'Subiendo...' : 'Click para seleccionar archivo'}
                    </span>
                  </label>
                </div>
              </div>
            </div>
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
                    onClick={() => handleDelete(file.id, file.url_storage)}
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
