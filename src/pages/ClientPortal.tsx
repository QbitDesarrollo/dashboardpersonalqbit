import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatDateSafe } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Download,
  FileBox,
  Calendar,
  CheckCircle2,
  Clock,
  Briefcase,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface Brand {
  id: string;
  nombre: string;
}

interface Task {
  id: string;
  brand_id: string;
  titulo_tarea: string;
  estado: string;
  fecha_entrega: string;
  prioridad: string;
  brands?: { nombre: string };
}

interface Deliverable {
  id: string;
  task_id: string;
  brand_id?: string;
  version: string;
  estado: string;
  link_final: string | null;
  deliverable_types?: { nombre: string };
  tasks?: { titulo_tarea: string };
}

interface FileRecord {
  id: string;
  nombre_archivo: string;
  url_storage: string;
  deliverable_id: string | null;
}

export default function ClientPortal() {
  const { profile } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);

  useEffect(() => {
    fetchBrands();
  }, [profile]);

  useEffect(() => {
    if (selectedBrand) {
      fetchBrandData();
    }
  }, [selectedBrand]);

  const fetchBrands = async () => {
    try {
      const data = await api.getBrands();
      const activeBrands = Array.isArray(data) ? data.filter((b: any) => b.activo) : [];
      if (activeBrands.length > 0) {
        setBrands(activeBrands);
        setSelectedBrand(activeBrands[0].id);
      }
    } catch (error) {
      console.error('Error fetching brands:', error);
    } finally {
      setLoading(false);
      setPrimeraCarga(false);
    }
  };

  const fetchBrandData = async () => {
    try {
      const [tasksRes, delRes, filesData] = await Promise.all([api.getTasks({ limit: 500 }), api.getDeliverables({ limit: 500 }), api.getFiles()]);
      const tasksList = ((tasksRes.tasks || []) as Task[]).filter((t) => t.brand_id === selectedBrand);
      setTasks(tasksList);
      const delList = ((delRes.deliverables || []) as Deliverable[]).filter((d) => d.brand_id === selectedBrand && ['aprobado', 'final'].includes(d.estado));
      setDeliverables(delList);
      const filesList = Array.isArray(filesData) ? filesData.filter((f: any) => f.task_id && tasksList.some((t: any) => t.id === f.task_id)) : [];
      setFiles(filesList);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos de la marca');
    }
  };

  const getStatusColor = (estado: string) => {
    const colors: Record<string, string> = {
      backlog: 'bg-status-backlog text-white',
      en_proceso: 'bg-status-in-progress text-white',
      en_revision: 'bg-status-in-review text-black',
      aprobado: 'bg-status-approved text-white',
      entregado: 'bg-status-delivered text-white',
      bloqueado: 'bg-status-blocked text-white',
    };
    return colors[estado] || 'bg-muted text-muted-foreground';
  };

  const getStatusLabel = (estado: string) => {
    const labels: Record<string, string> = {
      backlog: 'Pendiente',
      en_proceso: 'En Proceso',
      en_revision: 'En Revisión',
      aprobado: 'Aprobado',
      entregado: 'Entregado',
      bloqueado: 'Bloqueado',
    };
    return labels[estado] || estado;
  };

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Briefcase className="h-16 w-16 text-muted-foreground opacity-50 mb-4" />
        <h3 className="text-lg font-medium text-foreground">Sin marcas asignadas</h3>
        <p className="text-muted-foreground">No tienes marcas asignadas a tu cuenta.</p>
      </div>
    );
  }

  const approvedDeliverables = deliverables.filter(d => 
    d.estado === 'aprobado' || d.estado === 'final'
  );

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Portal Cliente</h2>
          <p className="text-sm text-muted-foreground">
            Bienvenido, {profile?.nombre}
          </p>
        </div>
        <Select value={selectedBrand} onValueChange={setSelectedBrand}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Seleccionar marca" />
          </SelectTrigger>
          <SelectContent>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Card className="glass-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-info/10 rounded-lg shrink-0">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-info" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">
                  {tasks.filter(t => t.estado === 'en_proceso').length}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">En Proceso</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-warning/10 rounded-lg shrink-0">
                <FileBox className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">
                  {tasks.filter(t => t.estado === 'en_revision').length}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">En Revisión</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-success/10 rounded-lg shrink-0">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">
                  {tasks.filter(t => t.estado === 'entregado').length}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Entregado</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg shrink-0">
                <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold">{approvedDeliverables.length}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Entregables</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tasks */}
      <Card className="glass-card">
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">Tareas de tu Marca</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-center py-6 sm:py-8 text-muted-foreground text-sm">No hay tareas</p>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm sm:text-base truncate">{task.titulo_tarea}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] sm:text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      {formatDateSafe(task.fecha_entrega)}
                    </div>
                  </div>
                  <Badge className={cn("text-[10px] sm:text-xs self-start sm:self-auto shrink-0", getStatusColor(task.estado))}>
                    {getStatusLabel(task.estado)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approved Deliverables */}
      <Card className="glass-card">
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
            Entregables Aprobados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {approvedDeliverables.length === 0 ? (
            <p className="text-center py-6 sm:py-8 text-muted-foreground text-sm">
              No hay entregables aprobados aún
            </p>
          ) : (
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
              {approvedDeliverables.map((del) => {
                const deliverableFiles = files.filter(f => f.deliverable_id === del.id);
                return (
                  <Card key={del.id} className="bg-muted/30">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm sm:text-base truncate">
                            {del.tasks?.titulo_tarea}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{del.version}</Badge>
                            <span className="text-[10px] sm:text-xs text-muted-foreground truncate">
                              {del.deliverable_types?.nombre}
                            </span>
                          </div>
                        </div>
                        <Badge className="bg-success text-success-foreground text-[10px] shrink-0">
                          {del.estado === 'final' ? 'Final' : 'Aprobado'}
                        </Badge>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        {del.link_final && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start text-xs sm:text-sm"
                            asChild
                          >
                            <a href={del.link_final} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 mr-2 shrink-0" />
                              <span className="truncate">Ver Entregable</span>
                            </a>
                          </Button>
                        )}
                        {deliverableFiles.map((file) => (
                          <Button
                            key={file.id}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-muted-foreground text-xs sm:text-sm"
                            asChild
                          >
                            <a href={file.url_storage} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-2 shrink-0" />
                              <span className="truncate">{file.nombre_archivo}</span>
                            </a>
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
