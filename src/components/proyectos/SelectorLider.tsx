import { SELECT } from '@/components/minutas/EditorPuntos';

interface Props {
  id: string;
  personas: { id: string; nombre: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/** The person who leads a project: receives and approves its weekly reports. */
export function SelectorLider({ id, personas, value, onChange, disabled }: Props) {
  return (
    <select id={id} className={SELECT} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>Elige al líder</option>
      {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  );
}
