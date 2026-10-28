import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/apiClient';
import { calcularReorden, mensajeErrorDepartamento, ordenarDepartamentos, type DepartamentoResumen } from '@/lib/departamentos';
import { DepartamentoDialog } from '@/components/departamentos/DepartamentoDialog';
import { DepartamentosTabla } from '@/components/departamentos/DepartamentosTabla';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function Departamentos() {
  const { isAdmin } = useAuth();
  const [departamentos, setDepartamentos] = useState<DepartamentoResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'activos' | 'archivados'>('activos');
  const [dialog, setDialog] = useState<{ departamento: api.Department | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const respuesta = await api.apiRequest('/api/data/departments/resumen');
      if (!respuesta.ok) throw new Error('No se pudieron cargar los departamentos');
      const datos: DepartamentoResumen[] = await respuesta.json();
      setDepartamentos(ordenarDepartamentos(datos));
      setError('');
    } catch (e) {
      setError(mensajeErrorDepartamento(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const activos = departamentos.filter(d => d.activo);
  const archivados = departamentos.filter(d => !d.activo);
  const visibles = tab === 'activos' ? activos : archivados;

  async function mover(id: string, direccion: -1 | 1) {
    if (!isAdmin || saving) return;
    const cambios = calcularReorden(visibles, id, direccion);
    if (!cambios.length) return;
    setSaving(true);
    try {
      for (const cambio of cambios) {
        await api.patchDepartment(cambio.id, { orden: cambio.orden });
      }
      await cargar();
    } catch (e) {
      // Una escritura previa puede haberse guardado: reconciliar antes de reintentar.
      await cargar();
      setError(mensajeErrorDepartamento(e));
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-4 sm:space-y-6 animate-fade-in">
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Departamentos</h2>
        <p className="text-sm text-muted-foreground">Solo administradores pueden crear y editar</p>
      </div>
      {isAdmin && <Button className="gradient-primary w-full sm:w-auto" disabled={saving || loading} onClick={() => setDialog({ departamento: null })}><Plus className="h-4 w-4 mr-2" />Nuevo departamento</Button>}
    </div>
    {error && <div role="alert" className="flex items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" onClick={() => void cargar()} disabled={saving}>Reintentar</Button></div>}
    <Card className="glass-card">
      <CardContent className="p-0">
        <div role="tablist" aria-label="Estado de departamentos" className="flex gap-1 border-b border-border px-4">
          {(['activos', 'archivados'] as const).map(valor => <button key={valor} type="button" role="tab" id={`tab-${valor}`} aria-controls="departamentos-panel" aria-selected={tab === valor}
            className={`px-3 py-3 text-sm font-medium border-b-2 ${tab === valor ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
            disabled={saving} onClick={() => setTab(valor)}>
            {valor === 'activos' ? `Activos (${activos.length})` : `Archivados (${archivados.length})`}
          </button>)}
        </div>
        <div role="tabpanel" id="departamentos-panel" aria-labelledby={`tab-${tab}`}>
          {loading ? <div role="status" className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="sr-only">Cargando departamentos</span></div>
            : <DepartamentosTabla departamentos={visibles} isAdmin={isAdmin} saving={saving} onEdit={departamento => setDialog({ departamento })} onMove={mover} />}
        </div>
      </CardContent>
    </Card>
    {isAdmin && dialog && <DepartamentoDialog departamento={dialog.departamento} departamentos={departamentos} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void cargar(); }} />}
  </div>;
}
