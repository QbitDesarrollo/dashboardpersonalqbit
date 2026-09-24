import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { exportTasksToCSV, exportTasksToExcel, exportTasksToPDF, type TaskForExport } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { FileSpreadsheet, FileText, FileDown, Loader2 } from 'lucide-react';

interface Task {
  id: string;
  titulo_tarea: string;
  estado: string;
  prioridad: string;
  fecha_inicio: string | null;
  fecha_entrega: string;
  cantidad_entregables: number;
  tiempo_trabajado: number;
  brand_id: string;
  desk_id: string | null;
  brands?: { nombre: string };
  desks?: { nombre: string };
  profiles?: { nombre: string };
}

interface Brand {
  id: string;
  nombre: string;
}

interface Desk {
  id: string;
  nombre: string;
}

export default function Reports() {
  const { pinnedBrandId, pinnedDeskId } = useGlobalFilter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterDesk, setFilterDesk] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [exporting, setExporting] = useState<'csv' | 'excel' | 'pdf' | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [tasksRes, brandsData, desksData] = await Promise.all([
          api.getTasks({ limit: 1000 }),
          api.getBrands(),
          api.getDesks(),
        ]);
        setTasks((tasksRes.tasks || []) as Task[]);
        setBrands(Array.isArray(brandsData) ? brandsData : []);
        setDesks(Array.isArray(desksData) ? desksData : []);
      } catch (e) {
        console.error(e);
        toast.error('Error al cargar datos');
      } finally {
        setLoading(false);
        setPrimeraCarga(false);
      }
    };
    load();
  }, []);

  const filteredTasks = tasks.filter((t) => {
    if (pinnedBrandId && t.brand_id !== pinnedBrandId) return false;
    if (pinnedDeskId && t.desk_id !== pinnedDeskId) return false;
    if (filterBrand !== 'all' && t.brand_id !== filterBrand) return false;
    if (filterDesk !== 'all' && t.desk_id !== filterDesk) return false;
    return true;
  });

  const toExportFormat = (): TaskForExport[] =>
    filteredTasks.map((t) => ({
      titulo_tarea: t.titulo_tarea,
      marca: t.brands?.nombre,
      mesa: t.desks?.nombre,
      responsable: t.profiles?.nombre,
      estado: t.estado,
      prioridad: t.prioridad,
      fecha_inicio: t.fecha_inicio,
      fecha_entrega: t.fecha_entrega,
      cantidad_entregables: t.cantidad_entregables,
      tiempo_trabajado: t.tiempo_trabajado ?? 0,
    }));

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    const data = toExportFormat();
    if (data.length === 0) {
      toast.error('No hay tareas para exportar con los filtros actuales');
      return;
    }
    setExporting(format);
    try {
      const base = `tareas-tiusdei-${new Date().toISOString().slice(0, 10)}`;
      if (format === 'csv') exportTasksToCSV(data, `${base}.csv`);
      else if (format === 'excel') exportTasksToExcel(data, `${base}.xlsx`);
      else exportTasksToPDF(data, `${base}.pdf`);
      toast.success(`Exportado: ${data.length} tareas`);
    } catch (e) {
      console.error(e);
      toast.error('Error al exportar');
    } finally {
      setExporting(null);
    }
  };

  // Solo la PRIMERA carga reemplaza la pantalla. Con `loading` a secas, cada
  // recarga (buscar, filtrar, paginar) desmontaba la pagina entera: se perdia
  // el foco del input y los dialogos abiertos se cerraban solos.
  if (loading && primeraCarga) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reportes y exportación</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Exporta tareas a Excel, PDF o CSV
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exportar tareas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Marca</label>
              <Select value={filterBrand} onValueChange={setFilterBrand}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Mesa</label>
              <Select value={filterDesk} onValueChange={setFilterDesk}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {desks.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {filteredTasks.length} tareas listas para exportar
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => handleExport('excel')}
              disabled={filteredTasks.length === 0 || !!exporting}
            >
              {exporting === 'excel' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('pdf')}
              disabled={filteredTasks.length === 0 || !!exporting}
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('csv')}
              disabled={filteredTasks.length === 0 || !!exporting}
            >
              {exporting === 'csv' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
