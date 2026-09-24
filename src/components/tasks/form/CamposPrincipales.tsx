import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DepartmentSelect } from '@/components/tasks/DepartmentSelect';
import { ProjectSelect } from '@/components/tasks/ProjectSelect';
import type { CatalogosTarea } from './useCatalogosTarea';
import type { TareaFormState } from './useTareaForm';

const Obligatorio = () => <span className="text-destructive font-semibold">*</span>;

/** Title, brand, desk, responsibles, department, project and task type. */
export function CamposPrincipales({ form, catalogos }: { form: TareaFormState; catalogos: CatalogosTarea }) {
  const { valores, cambiar, cambiarMesa, deskMembers, deskBrands } = form;
  const { brands, desks, taskTypes } = catalogos;
  const marcas = deskBrands ? brands.filter((b) => deskBrands.some((db) => db.id === b.id)) : brands;

  const alternarResponsable = (userId: string, elegido: boolean) => {
    const ids = elegido ? [...valores.responsable_ids, userId] : valores.responsable_ids.filter((id) => id !== userId);
    // The first responsible chosen gives the task their department (Administración > Usuarios).
    const primero = deskMembers.find((u) => u.id === ids[0]);
    const depto = elegido && ids.length === 1 && primero?.department_id ? primero.department_id : valores.department_id;
    cambiar({ responsable_ids: ids, responsable_user_id: ids[0] || '', department_id: depto });
  };

  return (
    <>
      <div className="col-span-1 sm:col-span-2 space-y-2">
        <Label htmlFor="titulo">Título <Obligatorio /></Label>
        <Input id="titulo" value={valores.titulo_tarea} onChange={(e) => cambiar({ titulo_tarea: e.target.value })} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="brand">Marca <Obligatorio /></Label>
        <Select value={valores.brand_id} onValueChange={(value) => cambiar({ brand_id: value })}>
          <SelectTrigger id="brand">
            <SelectValue placeholder={marcas.length ? 'Seleccionar marca' : 'No hay marcas. Crea una en Admin → Marcas'} />
          </SelectTrigger>
          <SelectContent>
            {marcas.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                {deskBrands ? 'Sin marcas asignadas a esta mesa' : 'No hay marcas. Crea una en Admin → Marcas'}
              </div>
            ) : (
              marcas.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.nombre}</SelectItem>)
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="desk">Mesa</Label>
        <Select value={valores.desk_id} onValueChange={cambiarMesa}>
          <SelectTrigger id="desk">
            <SelectValue placeholder={desks.length ? 'Seleccionar mesa' : 'No hay mesas. Crea una en Admin → Mesas'} />
          </SelectTrigger>
          <SelectContent>
            {desks.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">No hay mesas. Crea una en Admin → Mesas</div>
            ) : (
              desks.map((desk) => <SelectItem key={desk.id} value={desk.id}>{desk.nombre}</SelectItem>)
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Responsables (equipo de la mesa)</Label>
        {!valores.desk_id ? (
          <p className="text-sm text-muted-foreground border rounded-md px-3 py-2">Selecciona una mesa primero</p>
        ) : deskMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-md px-3 py-2">No hay equipo en esta mesa</p>
        ) : (
          <div className="border rounded-md p-2 space-y-1 max-h-40 overflow-y-auto">
            {deskMembers.map((user) => (
              <label key={user.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                <Checkbox
                  checked={valores.responsable_ids.includes(user.id)}
                  onCheckedChange={(checked) => alternarResponsable(user.id, !!checked)}
                />
                {user.nombre}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="departamento">Departamento</Label>
        <DepartmentSelect value={valores.department_id} onChange={(depId) => cambiar({ department_id: depId || '' })} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="project">Proyecto</Label>
        <ProjectSelect brandId={valores.brand_id} value={valores.project_id} onChange={(pid) => cambiar({ project_id: pid || '' })} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="task_type">Tipo de Tarea</Label>
        <Select value={valores.task_type_id} onValueChange={(value) => cambiar({ task_type_id: value === '__none__' ? '' : value })}>
          <SelectTrigger id="task_type">
            <SelectValue placeholder="Sin tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sin tipo</SelectItem>
            {taskTypes.map((tt) => <SelectItem key={tt.id} value={tt.id}>{tt.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
