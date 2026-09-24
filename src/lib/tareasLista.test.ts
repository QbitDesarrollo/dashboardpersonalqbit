import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDaysRemaining, getDepartmentColor, getPriorityColor, getStatusColor, getStatusLabel, parseLocalDate } from './tareasLista';

afterEach(() => { vi.useRealTimers(); });

describe('parseLocalDate', () => {
  it('lee la fecha como día local, con o sin hora', () => {
    expect(parseLocalDate('2026-09-24').toDateString()).toBe(new Date(2026, 8, 24).toDateString());
    expect(parseLocalDate('2026-09-24T00:00:00.000Z').toDateString()).toBe(new Date(2026, 8, 24).toDateString());
    expect(Number.isNaN(parseLocalDate(null).getTime())).toBe(true);
  });
});

describe('getDaysRemaining', () => {
  it('cuenta los días de hoy a la entrega; negativo si ya pasó', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 18, 30));
    expect(getDaysRemaining('2026-09-24')).toBe(0);
    expect(getDaysRemaining('2026-09-25')).toBe(1);
    expect(getDaysRemaining('2026-09-21')).toBe(-3);
  });
});

describe('colores y etiquetas', () => {
  it('nombra y colorea cada estado, y deja pasar los desconocidos', () => {
    expect(getStatusLabel('backlog')).toBe('Pendiente');
    expect(getStatusLabel('revision_cliente')).toBe('Revisión cliente');
    expect(getStatusLabel('otro')).toBe('otro');
    expect(getStatusColor('en_proceso')).toBe('bg-status-in-progress text-white');
    expect(getStatusColor('otro')).toBe('bg-muted text-muted-foreground');
  });

  it('colorea prioridades y departamentos antiguos', () => {
    expect(getPriorityColor('alta')).toBe('bg-priority-high text-white');
    expect(getPriorityColor('x')).toBe('bg-muted text-muted-foreground');
    expect(getDepartmentColor(' diseño ')).toBe('bg-purple-500/90 text-white');
    expect(getDepartmentColor('Otro')).toBe('bg-primary/80 text-primary-foreground');
    expect(getDepartmentColor(null)).toBe('bg-muted text-muted-foreground');
  });
});
