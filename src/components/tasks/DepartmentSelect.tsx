import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import type { Department } from '@/lib/apiClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Cache simple a nivel módulo — los departamentos cambian rara vez.
let _cache: Department[] | null = null;
const _subscribers: ((d: Department[]) => void)[] = [];

export function invalidateDepartmentsCache() {
  _cache = null;
}

export function useDepartments() {
  const [departments, setDepartments] = useState<Department[]>(_cache || []);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    let cancelled = false;
    if (_cache) {
      setDepartments(_cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getDepartments()
      .then((rows) => {
        if (cancelled) return;
        _cache = rows;
        setDepartments(rows);
      })
      .catch(() => { if (!cancelled) setDepartments([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { departments, loading };
}

interface Props {
  value: string | null | undefined;
  onChange: (departmentId: string | null) => void;
  placeholder?: string;
  includeNone?: boolean;
  onlyActive?: boolean;
  className?: string;
  disabled?: boolean;
}

const NONE_VALUE = '__none__';

export function DepartmentSelect({
  value,
  onChange,
  placeholder = 'Seleccionar departamento',
  includeNone = true,
  onlyActive = true,
  className,
  disabled,
}: Props) {
  const { departments } = useDepartments();
  const list = onlyActive ? departments.filter((d) => d.activo) : departments;

  return (
    <Select
      value={value || NONE_VALUE}
      onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeNone && (
          <SelectItem value={NONE_VALUE}>
            <span className="text-muted-foreground">Sin departamento</span>
          </SelectItem>
        )}
        {list.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: d.color || '#94a3b8' }}
              />
              {d.nombre}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Badge de departamento con su color (para listas y cards). */
export function DepartmentBadge({ nombre, color }: { nombre?: string | null; color?: string | null }) {
  if (!nombre) return null;
  const c = color || '#94a3b8';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border"
      style={{ backgroundColor: `${c}1a`, borderColor: `${c}55`, color: c }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
      {nombre}
    </span>
  );
}
