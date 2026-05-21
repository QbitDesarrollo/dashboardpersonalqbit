import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import type { Novedad } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor';
import { Sparkles, Plus, Loader2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn, getInitials } from '@/lib/utils';

const TIPOS_NOVEDAD = ['FEATURE', 'FIX', 'MEJORA', 'SEGURIDAD'];

const tipoNovedadBorder: Record<string, string> = {
  FEATURE: 'border-l-blue-500',
  FIX: 'border-l-green-500',
  MEJORA: 'border-l-orange-500',
  SEGURIDAD: 'border-l-red-500',
};
const tipoNovedadBadge: Record<string, string> = {
  FEATURE: 'bg-blue-100 text-blue-700 border-blue-200',
  FIX: 'bg-green-100 text-green-700 border-green-200',
  MEJORA: 'bg-orange-100 text-orange-700 border-orange-200',
  SEGURIDAD: 'bg-red-100 text-red-700 border-red-200',
};

function fmtDate(s: string): string {
  try { return new Date(s).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return s; }
}

export default function Novedades() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === 'admin';

  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState('FEATURE');
  const [version, setVersion] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.getNovedades();
      setNovedades(r.novedades);
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar novedades');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const publicar = async () => {
    if (!titulo.trim()) { toast.error('El título es obligatorio'); return; }
    setSaving(true);
    try {
      await api.createNovedad({ titulo: titulo.trim(), descripcion, tipo, version: version || undefined });
      toast.success('Novedad publicada');
      setTitulo(''); setDescripcion(''); setTipo('FEATURE'); setVersion('');
      setFormOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Error al publicar');
    }
    setSaving(false);
  };

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta novedad?')) return;
    try {
      await api.deleteNovedad(id);
      toast.success('Novedad eliminada');
      load();
    } catch (e: any) { toast.error(e.message || 'Error'); }
  };

  return (
    <div className="container mx-auto py-4 sm:py-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Novedades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Changelog de Tiusdei — nuevas funciones, fixes y mejoras.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setFormOpen((v) => !v)} className="gap-1.5">
            {formOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {formOpen ? 'Cancelar' : 'Publicar novedad'}
          </Button>
        )}
      </div>

      {isAdmin && formOpen && (
        <Card className="glass-card">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Título *</Label>
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Sistema de incidencias" maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_NOVEDAD.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Versión</Label>
                <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.5" className="w-[100px]" maxLength={20} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descripción</Label>
              <RichTextEditor content={descripcion} onChange={setDescripcion} placeholder="Detalle de la novedad..." minHeight="120px" />
            </div>
            <div className="flex justify-end">
              <Button onClick={publicar} disabled={saving || !titulo.trim()}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Publicar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : novedades.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-10">Aún no hay novedades publicadas.</div>
      ) : (
        <div className="space-y-3">
          {novedades.map((n) => (
            <Card key={n.id} className={cn('glass-card border-l-4', tipoNovedadBorder[n.tipo])}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn('text-[10px]', tipoNovedadBadge[n.tipo])}>{n.tipo}</Badge>
                    {n.version && <Badge variant="outline" className="text-[10px]">v{n.version}</Badge>}
                    {n.incidencia_titulo && (
                      <span className="text-[10px] text-muted-foreground">↪ {n.incidencia_titulo}</span>
                    )}
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => eliminar(n.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <h3 className="text-base font-bold mt-1.5">{n.titulo}</h3>
                {n.descripcion && (
                  <div className="mt-1.5 text-sm">
                    <RichTextViewer content={n.descripcion} />
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
                  <Avatar className="h-5 w-5">
                    {n.creado_por_avatar && <AvatarImage src={n.creado_por_avatar} />}
                    <AvatarFallback className="text-[8px]">{getInitials(n.creado_por_nombre || '?')}</AvatarFallback>
                  </Avatar>
                  <span>{n.creado_por_nombre || '—'}</span>
                  <span>·</span>
                  <span>{fmtDate(n.fecha)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
