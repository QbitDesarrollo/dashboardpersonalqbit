import { Archive, ArrowDown, ArrowUp, Edit, GripVertical, RotateCcw, Trash2 } from 'lucide-react';
import type { DepartamentoResumen } from '@/lib/departamentos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Props {
  departamentos: DepartamentoResumen[];
  isAdmin: boolean;
  saving: boolean;
  onEdit: (departamento: DepartamentoResumen) => void;
  onMove: (id: string, direccion: -1 | 1) => void;
  onArchive: (departamento: DepartamentoResumen) => void;
  onRestore: (departamento: DepartamentoResumen) => void;
  onDelete: (departamento: DepartamentoResumen) => void;
}

export function DepartamentosTabla({ departamentos, isAdmin, saving, onEdit, onMove, onArchive, onRestore, onDelete }: Props) {
  return <div className="overflow-x-auto">
    <Table>
      <TableHeader><TableRow>
        {['Orden', 'Departamento', 'Sigue', 'Personas', 'Tareas', 'Canal de mesa', 'Estado', 'Acciones'].map(columna => <TableHead key={columna}>{columna}</TableHead>)}
      </TableRow></TableHeader>
      <TableBody>
        {departamentos.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No hay departamentos en esta pestaña</TableCell></TableRow>}
        {departamentos.map((d, i) => <TableRow key={d.id} className="border-border hover:bg-muted/50">
          <TableCell>
            <div className="flex items-center gap-1">
              {isAdmin && <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              <span>{d.orden}</span>
              {isAdmin && <div className="flex flex-col">
                <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Subir ${d.nombre}`} disabled={saving || i === 0} onClick={() => onMove(d.id, -1)}><ArrowUp className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Bajar ${d.nombre}`} disabled={saving || i === departamentos.length - 1} onClick={() => onMove(d.id, 1)}><ArrowDown className="h-3 w-3" /></Button>
              </div>}
            </div>
          </TableCell>
          <TableCell className="font-medium"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color || '#64748b' }} />{d.nombre}</span></TableCell>
          <TableCell>{d.next_department_nombre || '—'}</TableCell>
          <TableCell>{d.personas}</TableCell>
          <TableCell className="whitespace-nowrap">{d.tareas_abiertas} abiertas / {d.tareas_total}</TableCell>
          <TableCell>{d.canales.length ? <div className="flex flex-wrap gap-1">{d.canales.map(canal => <Badge variant="outline" key={canal}>Canal: {canal}</Badge>)}</div> : '—'}</TableCell>
          <TableCell><Badge variant={d.activo ? 'default' : 'secondary'}>{d.activo ? 'Activo' : 'Archivado'}</Badge></TableCell>
          <TableCell>{isAdmin && <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" disabled={saving} aria-label={`Editar ${d.nombre}`} onClick={() => onEdit(d)}><Edit className="h-4 w-4" /></Button>
            {d.activo ? <Button variant="ghost" size="icon" disabled={saving} aria-label={`Archivar ${d.nombre}`} onClick={() => onArchive(d)}><Archive className="h-4 w-4" /></Button> : <>
              <Button variant="ghost" size="sm" disabled={saving} aria-label={`Restaurar ${d.nombre}`} onClick={() => onRestore(d)}><RotateCcw className="h-4 w-4 mr-1" />Restaurar</Button>
              <Button variant="ghost" size="sm" disabled={saving} aria-label={`Eliminar definitivamente ${d.nombre}`} onClick={() => onDelete(d)}><Trash2 className="h-4 w-4 mr-1" />Eliminar definitivamente</Button>
            </>}
          </div>}</TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
  </div>;
}
