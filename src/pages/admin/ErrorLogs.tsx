import { useEffect, useState, useCallback } from 'react';
import * as api from '@/lib/apiClient';
import type { ErrorLog } from '@/lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, RefreshCw, Check, Trash2, ChevronDown, ChevronRight, Bug, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AgentChat } from '@/components/admin/AgentChat';

const LEVEL_COLORS: Record<string, string> = {
  fatal: 'bg-red-600 text-white',
  error: 'bg-red-100 text-red-700 border-red-200',
  warn: 'bg-amber-100 text-amber-700 border-amber-200',
};

function fmt(s: string) {
  try { return new Date(s).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

export default function ErrorLogs() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [stats, setStats] = useState<{ abiertos: number; resueltos: number; ultima_hora: number; fatales: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'0' | '1' | 'all'>('0');
  const [level, setLevel] = useState<string>('all');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [auto, setAuto] = useState(true);
  const [view, setView] = useState<'errores' | 'chat'>('errores');

  const load = useCallback(async () => {
    try {
      const [r, st] = await Promise.all([
        api.getErrorLogs({
          resolved: tab === 'all' ? undefined : (tab === '1' ? 1 : 0),
          level: level === 'all' ? undefined : level,
          q: q.trim() || undefined,
          limit: 200,
        }),
        api.getErrorLogStats(),
      ]);
      setLogs(r.logs);
      setStats(st);
    } catch (e) {
      toast.error('No se pudo cargar la consola de errores');
    } finally {
      setLoading(false);
    }
  }, [tab, level, q]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Auto-refresh cada 15s
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [auto, load]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const resolve = async (id: string, resolved: boolean) => {
    try { await api.resolveErrorLog(id, resolved); load(); }
    catch { toast.error('No se pudo actualizar'); }
  };

  const resolveAll = async () => {
    if (!confirm('¿Marcar todos los errores abiertos como resueltos?')) return;
    try { await api.resolveAllErrorLogs(); toast.success('Todos marcados como resueltos'); load(); }
    catch { toast.error('Error'); }
  };

  const clearResolved = async () => {
    if (!confirm('¿Borrar los errores ya resueltos?')) return;
    try { await api.clearErrorLogs(false); toast.success('Resueltos borrados'); load(); }
    catch { toast.error('Error'); }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
          <Bug className="h-5 w-5 text-red-500" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Consola de errores</h1>
          <p className="text-sm text-muted-foreground">Errores de la plataforma en tiempo real. Solo admin.</p>
        </div>
        <Button variant={auto ? 'default' : 'outline'} size="sm" onClick={() => setAuto((a) => !a)}>
          <RefreshCw className={cn('h-4 w-4', auto && 'animate-spin')} style={{ animationDuration: '3s' }} />
          {auto ? 'Auto' : 'Manual'}
        </Button>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" />Refrescar</Button>
      </div>

      {/* Tabs: Consola de errores | Asistente IA */}
      <div className="flex rounded-lg border overflow-hidden w-fit">
        <button onClick={() => setView('errores')} className={cn('px-4 py-1.5 text-sm font-medium', view === 'errores' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>Consola de errores</button>
        <button onClick={() => setView('chat')} className={cn('px-4 py-1.5 text-sm font-medium flex items-center gap-1.5', view === 'chat' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}><Sparkles className="h-3.5 w-3.5" />Asistente IA</button>
      </div>

      {view === 'chat' && <AgentChat />}

      {view === 'errores' && (<>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Abiertos" value={stats.abiertos} variant={stats.abiertos > 0 ? 'danger' : 'ok'} />
          <StatCard label="Última hora" value={stats.ultima_hora} variant={stats.ultima_hora > 0 ? 'warn' : 'ok'} />
          <StatCard label="Fatales" value={stats.fatales} variant={stats.fatales > 0 ? 'danger' : 'ok'} />
          <StatCard label="Resueltos" value={stats.resueltos} variant="ok" />
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border overflow-hidden">
          {(['0', '1', 'all'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn('px-3 py-1.5 text-xs font-medium', tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              {t === '0' ? 'Abiertos' : t === '1' ? 'Resueltos' : 'Todos'}
            </button>
          ))}
        </div>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niveles</SelectItem>
            <SelectItem value="fatal">Fatal</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Buscar mensaje/ruta/tag…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-56 text-xs" />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={resolveAll}><Check className="h-4 w-4" />Resolver todos</Button>
          <Button variant="outline" size="sm" className="text-red-600" onClick={clearResolved}><Trash2 className="h-4 w-4" />Limpiar resueltos</Button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
          Sin errores {tab === '0' ? 'abiertos' : ''}. Todo limpio.
        </CardContent></Card>
      ) : (
        <div className="space-y-1.5">
          {logs.map((l) => {
            const open = expanded.has(l.id);
            return (
              <Card key={l.id} className={cn('overflow-hidden', !l.resolved && l.level === 'fatal' && 'border-red-400')}>
                <div className="flex items-start gap-2 p-3 cursor-pointer hover:bg-muted/30" onClick={() => toggle(l.id)}>
                  {open ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn('text-[9px]', LEVEL_COLORS[l.level] || '')}>{l.level.toUpperCase()}</Badge>
                      {l.tag && <Badge variant="outline" className="text-[9px]">{l.tag}</Badge>}
                      {l.count > 1 && <Badge variant="secondary" className="text-[9px]">×{l.count}</Badge>}
                      {l.method && l.route && <span className="text-[10px] text-muted-foreground font-mono">{l.method} {l.route}</span>}
                      <span className="text-[10px] text-muted-foreground ml-auto">{fmt(l.last_seen_at)}</span>
                    </div>
                    <p className={cn('text-sm mt-1 break-words', !open && 'line-clamp-1')}>{l.message}</p>
                  </div>
                </div>
                {open && (
                  <div className="px-3 pb-3 pl-9 space-y-2">
                    {l.stack && (
                      <pre className="text-[11px] bg-muted/60 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-words max-h-64">{l.stack}</pre>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      {l.user_nombre && <span>Usuario: {l.user_nombre}</span>}
                      {l.status_code && <span>HTTP {l.status_code}</span>}
                      <span>Primer visto: {fmt(l.created_at)}</span>
                      <Button
                        size="sm"
                        variant={l.resolved ? 'outline' : 'default'}
                        className="ml-auto h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); resolve(l.id, !l.resolved); }}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {l.resolved ? 'Reabrir' : 'Resolver'}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      </>)}
    </div>
  );
}

function StatCard({ label, value, variant }: { label: string; value: number; variant: 'ok' | 'warn' | 'danger' }) {
  const c = variant === 'danger' ? 'text-red-600' : variant === 'warn' ? 'text-amber-600' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-2xl font-bold', c)}>{value}</p>
      </CardContent>
    </Card>
  );
}
