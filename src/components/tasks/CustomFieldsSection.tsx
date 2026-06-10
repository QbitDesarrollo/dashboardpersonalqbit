import { useEffect, useState, useCallback } from 'react';
import * as api from '@/lib/apiClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SlidersHorizontal, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface FieldDef {
  id: string;
  name: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'url';
  options?: string[] | null;
  is_required?: number | boolean;
}

interface Props {
  taskId: string;
  brandId?: string | null;
  canEdit?: boolean;
}

// Sección autocontenida: campos personalizados de la tarea.
// No renderiza nada si no hay definiciones (no estorba cuando la feature no se usa).
export function CustomFieldsSection({ taskId, brandId, canEdit = true }: Props) {
  const [defs, setDefs] = useState<FieldDef[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [definitions, current] = await Promise.all([
        api.getCustomFieldDefinitions(brandId || undefined),
        api.getTaskCustomFields(taskId),
      ]);
      const defsList: FieldDef[] = Array.isArray(definitions) ? definitions : [];
      setDefs(defsList);
      // Mapear valores actuales por field_id según el tipo
      const map: Record<string, any> = {};
      for (const v of (Array.isArray(current) ? current : [])) {
        if (v.value_text != null) map[v.field_id] = v.value_text;
        else if (v.value_number != null) map[v.field_id] = v.value_number;
        else if (v.value_date != null) map[v.field_id] = String(v.value_date).slice(0, 10);
        else if (v.value_boolean != null) map[v.field_id] = !!v.value_boolean;
      }
      setValues(map);
      setDirty(false);
    } catch {
      setDefs([]);
    } finally {
      setLoading(false);
    }
  }, [taskId, brandId]);

  useEffect(() => { load(); }, [load]);

  const setVal = (id: string, val: any) => {
    setValues((prev) => ({ ...prev, [id]: val }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = defs.map((d) => ({ field_id: d.id, value: values[d.id] ?? null }));
      await api.saveTaskCustomFields(taskId, payload);
      toast.success('Campos guardados');
      setDirty(false);
    } catch {
      toast.error('No se pudieron guardar los campos');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;
  if (defs.length === 0) return null;

  return (
    <div className="pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <SlidersHorizontal className="h-4 w-4" />
          Campos personalizados
        </h4>
        {canEdit && dirty && (
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {defs.map((d) => (
          <div key={d.id} className="space-y-1">
            <Label className="text-xs">{d.name}{d.is_required ? ' *' : ''}</Label>
            {d.field_type === 'checkbox' ? (
              <div className="flex items-center h-9">
                <Checkbox
                  checked={!!values[d.id]}
                  disabled={!canEdit}
                  onCheckedChange={(c) => setVal(d.id, !!c)}
                />
              </div>
            ) : d.field_type === 'select' ? (
              <Select value={values[d.id] ?? ''} disabled={!canEdit} onValueChange={(v) => setVal(d.id, v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {(d.options || []).map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-9"
                type={d.field_type === 'number' ? 'number' : d.field_type === 'date' ? 'date' : d.field_type === 'url' ? 'url' : 'text'}
                value={values[d.id] ?? ''}
                disabled={!canEdit}
                placeholder={d.field_type === 'url' ? 'https://...' : ''}
                onChange={(e) => setVal(d.id, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
