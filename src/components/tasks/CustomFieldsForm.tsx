import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface FieldDefinition {
  id: string;
  name: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'url';
  options?: string[];
  is_required: boolean;
}

interface FieldValue {
  field_id: string;
  value_text?: string | null;
  value_number?: number | null;
  value_date?: string | null;
  value_boolean?: boolean | null;
}

interface CustomFieldsFormProps {
  taskId?: string | null;
  brandId?: string;
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  readOnly?: boolean;
}

export function CustomFieldsForm({ taskId, brandId, values, onChange, readOnly }: CustomFieldsFormProps) {
  const [definitions, setDefinitions] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getCustomFieldDefinitions(brandId)
      .then((defs: FieldDefinition[]) => {
        setDefinitions(Array.isArray(defs) ? defs : []);
      })
      .catch(() => setDefinitions([]))
      .finally(() => setLoading(false));
  }, [brandId]);

  useEffect(() => {
    if (!taskId) return;
    api.getTaskCustomFields(taskId)
      .then((vals: FieldValue[]) => {
        if (!Array.isArray(vals)) return;
        vals.forEach((v) => {
          const val = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? '';
          onChange(v.field_id, val);
        });
      })
      .catch(() => {});
  }, [taskId]);

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando campos...</div>;
  if (definitions.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">Campos Personalizados</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {definitions.map((def) => {
          const val = values[def.id];
          return (
            <div key={def.id} className="space-y-1">
              <Label className="text-xs">
                {def.name}
                {def.is_required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              {def.field_type === 'text' && (
                <Input
                  value={(val as string) || ''}
                  onChange={(e) => onChange(def.id, e.target.value)}
                  disabled={readOnly}
                  placeholder={def.name}
                  className="h-8 text-sm"
                />
              )}
              {def.field_type === 'url' && (
                <Input
                  type="url"
                  value={(val as string) || ''}
                  onChange={(e) => onChange(def.id, e.target.value)}
                  disabled={readOnly}
                  placeholder="https://..."
                  className="h-8 text-sm"
                />
              )}
              {def.field_type === 'number' && (
                <Input
                  type="number"
                  value={val != null ? String(val) : ''}
                  onChange={(e) => onChange(def.id, e.target.value ? parseFloat(e.target.value) : null)}
                  disabled={readOnly}
                  className="h-8 text-sm"
                />
              )}
              {def.field_type === 'date' && (
                <Input
                  type="date"
                  value={(val as string) || ''}
                  onChange={(e) => onChange(def.id, e.target.value)}
                  disabled={readOnly}
                  className="h-8 text-sm"
                />
              )}
              {def.field_type === 'checkbox' && (
                <div className="flex items-center gap-2 h-8">
                  <Checkbox
                    checked={!!val}
                    onCheckedChange={(checked) => onChange(def.id, !!checked)}
                    disabled={readOnly}
                  />
                  <span className="text-sm">{val ? 'Sí' : 'No'}</span>
                </div>
              )}
              {def.field_type === 'select' && def.options && (
                <Select
                  value={(val as string) || ''}
                  onValueChange={(v) => onChange(def.id, v)}
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {def.options.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
