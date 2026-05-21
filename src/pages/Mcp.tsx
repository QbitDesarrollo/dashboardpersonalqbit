import { useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';
import type { ApiToken } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plug, Plus, Copy, Check, Trash2, KeyRound, ShieldCheck, Lock } from 'lucide-react';
import { toast } from 'sonner';

// Mesa "Pycca - Loialty" — la sección MCP es solo para su equipo (+ admins).
const PYCCA_DESK_ID = 'e8e49f2e-465c-44bd-86ef-e560c7876431';

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

export default function Mcp() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === 'admin';

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  // Chequeo de acceso: admins siempre; el resto, solo si pertenece a la mesa Pycca.
  useEffect(() => {
    if (isAdmin) {
      setAllowed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const desks = await api.getDesks();
        const isPycca = Array.isArray(desks) && desks.some(
          (d: { id?: string; nombre?: string }) =>
            d.id === PYCCA_DESK_ID || (d.nombre || '').toLowerCase().includes('pycca'),
        );
        if (!cancelled) setAllowed(isPycca);
      } catch {
        if (!cancelled) setAllowed(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const load = async () => {
    try {
      setLoading(true);
      const rows = await api.getApiTokens();
      setTokens(rows);
    } catch (e) {
      toast.error('No se pudieron cargar los tokens');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) load();
  }, [allowed]);

  const handleCreate = async () => {
    try {
      setCreating(true);
      const result = await api.createApiToken(label.trim() || undefined);
      setNewToken(result.token);
      setLabel('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el token');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const handleRevoke = async () => {
    if (!revokeId) return;
    try {
      await api.revokeApiToken(revokeId);
      toast.success('Token revocado');
      setRevokeId(null);
      await load();
    } catch (e) {
      toast.error('No se pudo revocar el token');
    }
  };

  // Verificando acceso
  if (allowed === null) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sin acceso
  if (!allowed) {
    return (
      <div className="max-w-md mx-auto p-6 mt-16 text-center space-y-3">
        <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center mx-auto">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">Sección restringida</h1>
        <p className="text-sm text-muted-foreground">
          La integración MCP está disponible solo para el equipo de Pycca. Si necesitas
          acceso, pídele a un administrador que te agregue a la mesa.
        </p>
      </div>
    );
  }

  const activos = tokens.filter((t) => !t.revoked_at);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Plug className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Integración MCP</h1>
          <p className="text-sm text-muted-foreground">
            Conecta Tiusdei con tu agente de IA (Claude) para crear tareas automáticamente.
          </p>
        </div>
      </div>

      {/* Qué es esto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            ¿Cómo funciona?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            El <strong>MCP de Tiusdei</strong> ya está alojado en el servidor: le da a tu agente de IA
            la capacidad de crear tareas directamente en la plataforma — con marca, mesa, responsables,
            prioridad y fechas. No necesitas instalar nada.
          </p>
          <p>
            Para conectarlo necesitas un <strong>token de API</strong>. El token está ligado a tu
            usuario: el agente solo verá y podrá usar lo mismo que ves en Tiusdei.
          </p>
          <ol className="list-decimal list-inside space-y-1 pt-1">
            <li>Genera un token aquí abajo y cópialo (se muestra una sola vez).</li>
            <li>
              En Claude Code, registra el MCP con tu token:
              <pre className="mt-1 mb-1 text-xs bg-muted text-foreground p-2 rounded overflow-x-auto whitespace-pre-wrap">{`claude mcp add --transport http tiusdei https://tiusdei.qbit.ec/mcp \\
  --header "Authorization: Bearer <tu-token>"`}</pre>
            </li>
            <li>Verifica con <code className="text-xs bg-muted px-1 py-0.5 rounded">/mcp</code> en Claude Code: debe aparecer <strong>tiusdei</strong> conectado. Listo.</li>
          </ol>
        </CardContent>
      </Card>

      {/* Generar token */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Generar nuevo token
          </CardTitle>
          <CardDescription>
            Ponle un nombre para reconocerlo después (ej. "Mi laptop", "Claude Code").
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Nombre del token (opcional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            <Button onClick={handleCreate} disabled={creating} className="shrink-0">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Generar token
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de tokens */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tus tokens {!loading && <span className="text-muted-foreground font-normal">({activos.length} activos)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Todavía no has generado ningún token.
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{t.label || 'Token sin nombre'}</span>
                      {t.revoked_at ? (
                        <Badge variant="outline" className="text-red-600 border-red-200">Revocado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-700 border-green-200">Activo</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      <code className="bg-muted px-1 rounded">{t.token_prefix}…</code>
                      <span>Creado {formatDate(t.created_at)}</span>
                      <span>Último uso: {formatDate(t.last_used_at)}</span>
                    </div>
                  </div>
                  {!t.revoked_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                      onClick={() => setRevokeId(t.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Revocar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: token recién creado */}
      <Dialog open={!!newToken} onOpenChange={(o) => { if (!o) { setNewToken(null); setCopied(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Token generado
            </DialogTitle>
            <DialogDescription>
              Cópialo ahora — por seguridad, <strong>no se vuelve a mostrar</strong>. Si lo pierdes,
              genera uno nuevo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted p-3 rounded-lg break-all font-mono">
              {newToken}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => { setNewToken(null); setCopied(false); }}>Listo, ya lo copié</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar revocación */}
      <AlertDialog open={!!revokeId} onOpenChange={(o) => { if (!o) setRevokeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar este token?</AlertDialogTitle>
            <AlertDialogDescription>
              El MCP o agente que lo esté usando dejará de funcionar inmediatamente. Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-red-600 hover:bg-red-700">
              Revocar token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
