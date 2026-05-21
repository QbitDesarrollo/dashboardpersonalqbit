import { useEffect, useState, useCallback, useRef } from 'react';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Loader2, Wifi, WifiOff, QrCode, RefreshCw, Users, MessageCircle,
  Shield, Phone, Clock, AlertTriangle, CheckCircle, XCircle, Eye,
  Building2, CircleDot
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────

interface WAGroup {
  id: string;
  wa_group_id: string;
  name: string;
  brand_id: string | null;
  brand_nombre: string | null;
  is_monitored: number;
  sla_minutes: number;
  member_count: number;
  pending_count: number;
}

interface WAMember {
  id: string;
  wa_group_id: string;
  phone_number: string;
  wa_name: string | null;
  role: string;
  user_id: string | null;
  user_nombre: string | null;
  user_email: string | null;
}

interface WAMessage {
  id: string;
  wa_group_id: string;
  group_name: string;
  sender_phone: string;
  sender_name: string | null;
  sender_role: string | null;
  message_text: string;
  message_type: string;
  is_from_client: number;
  sla_status: string;
  sla_response_seconds: number | null;
  created_at: string;
}

interface SlaRule {
  id: string;
  brand_id: string | null;
  brand_nombre: string | null;
  wa_group_id: string | null;
  group_name: string | null;
  sla_minutes: number;
  warning_percent: number;
  work_start: string;
  work_end: string;
  work_days: string;
  auto_create_task: number;
  auto_notify_leader: number;
}

interface Brand {
  id: string;
  nombre: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function slaStatusBadge(status: string) {
  switch (status) {
    case 'ok': return <Badge className="bg-green-100 text-green-800">OK</Badge>;
    case 'responded': return <Badge className="bg-blue-100 text-blue-800">Respondido</Badge>;
    case 'warning': return <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>;
    case 'breached': return <Badge className="bg-red-100 text-red-800">Vencido</Badge>;
    default: return <Badge variant="secondary">N/A</Badge>;
  }
}

function roleBadge(role: string) {
  switch (role) {
    case 'lider': return <Badge className="bg-purple-100 text-purple-800">Lider</Badge>;
    case 'ejecutivo': return <Badge className="bg-blue-100 text-blue-800">Ejecutivo</Badge>;
    case 'cliente': return <Badge className="bg-orange-100 text-orange-800">Cliente</Badge>;
    case 'monitor': return <Badge className="bg-gray-100 text-gray-800">Monitor</Badge>;
    case 'ignorar': return <Badge variant="secondary">Ignorar</Badge>;
    default: return <Badge variant="secondary">{role}</Badge>;
  }
}

// ─── Connection Tab ───────────────────────────────────────────────────

function ConnectionTab() {
  const [status, setStatus] = useState<string>('disconnected');
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ monitored_groups: 0, messages_24h: 0, pending_responses: 0, avg_response_seconds: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getWAStatus();
      setStatus(data.status);
      setQr(data.qr);
    } catch { /* ignore */ }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getWAStats();
      setStats(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchStats();
    // Poll status every 3 seconds when connecting/qr_pending
    pollRef.current = setInterval(() => {
      fetchStatus();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus, fetchStats]);

  // Stop polling when connected
  useEffect(() => {
    if (status === 'connected' && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      fetchStats();
    }
  }, [status, fetchStats]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await api.connectWA();
      toast.success('Iniciando conexión...');
      // Start polling
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 3000);
      }
    } catch (e) {
      toast.error('Error al conectar');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar WhatsApp? Necesitarás escanear el QR de nuevo.')) return;
    setLoading(true);
    try {
      await api.disconnectWA();
      setStatus('disconnected');
      setQr(null);
      toast.success('Desconectado');
    } catch {
      toast.error('Error al desconectar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${status === 'connected' ? 'bg-green-100' : 'bg-gray-100'}`}>
                {status === 'connected' ? <Wifi className="h-5 w-5 text-green-600" /> : <WifiOff className="h-5 w-5 text-gray-500" />}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <p className="text-lg font-semibold capitalize">{status === 'qr_pending' ? 'Esperando QR' : status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Conectando...' : 'Desconectado'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100"><Users className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Grupos monitoreados</p>
                <p className="text-lg font-semibold">{stats.monitored_groups}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100"><MessageCircle className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Mensajes (24h)</p>
                <p className="text-lg font-semibold">{stats.messages_24h}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stats.pending_responses > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                {stats.pending_responses > 0 ? <AlertTriangle className="h-5 w-5 text-red-600" /> : <CheckCircle className="h-5 w-5 text-green-600" />}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sin respuesta</p>
                <p className="text-lg font-semibold">{stats.pending_responses}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connection card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Conexión WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'disconnected' && (
            <div className="text-center py-8">
              <WifiOff className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">WhatsApp no está conectado. Haz clic en conectar para generar el código QR.</p>
              <Button onClick={handleConnect} disabled={loading} size="lg">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                Conectar WhatsApp
              </Button>
            </div>
          )}

          {(status === 'connecting' || status === 'qr_pending') && (
            <div className="text-center py-8">
              {qr ? (
                <>
                  <p className="text-lg font-medium mb-4">Escanea este código QR con WhatsApp</p>
                  <p className="text-sm text-muted-foreground mb-4">Abre WhatsApp en tu celular &gt; Dispositivos vinculados &gt; Vincular dispositivo</p>
                  <div className="inline-block p-4 bg-white rounded-xl shadow-lg border">
                    <img src={qr} alt="QR Code" className="w-72 h-72" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">El QR se actualiza automáticamente. Si expira, se generará uno nuevo.</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Generando código QR...</p>
                </>
              )}
            </div>
          )}

          {status === 'connected' && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-4">
                <Wifi className="h-10 w-10 text-green-600" />
              </div>
              <p className="text-lg font-medium text-green-700 mb-2">WhatsApp conectado</p>
              <p className="text-sm text-muted-foreground mb-4">El monitor está activo y escuchando mensajes de los grupos configurados.</p>
              {stats.avg_response_seconds > 0 && (
                <p className="text-sm text-muted-foreground mb-4">
                  <Clock className="h-4 w-4 inline mr-1" />
                  Tiempo promedio de respuesta (7 días): <strong>{formatTime(stats.avg_response_seconds)}</strong>
                </p>
              )}
              <Button variant="destructive" onClick={handleDisconnect} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <WifiOff className="h-4 w-4 mr-2" />}
                Desconectar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Groups Tab ───────────────────────────────────────────────────────

function GroupsTab() {
  const [groups, setGroups] = useState<WAGroup[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [membersDialog, setMembersDialog] = useState<string | null>(null);
  const [members, setMembers] = useState<WAMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [g, b] = await Promise.all([api.getWAGroups(), api.getBrands()]);
      setGroups(Array.isArray(g) ? g : []);
      setBrands(Array.isArray(b) ? b : []);
    } catch {
      toast.error('Error al cargar grupos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.syncWAGroups();
      toast.success('Grupos sincronizados');
      await loadData();
    } catch {
      toast.error('Error al sincronizar. ¿WhatsApp está conectado?');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleMonitor = async (group: WAGroup) => {
    try {
      await api.patchWAGroup(group.id, { is_monitored: !group.is_monitored });
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, is_monitored: g.is_monitored ? 0 : 1 } : g));
    } catch {
      toast.error('Error');
    }
  };

  const handleBrandChange = async (group: WAGroup, brandId: string) => {
    try {
      await api.patchWAGroup(group.id, { brand_id: brandId === '_none' ? null : brandId });
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, brand_id: brandId === '_none' ? null : brandId, brand_nombre: brands.find(b => b.id === brandId)?.nombre || null } : g));
    } catch {
      toast.error('Error');
    }
  };

  const openMembers = async (group: WAGroup) => {
    setMembersDialog(group.id);
    setLoadingMembers(true);
    try {
      const data = await api.getWAGroupMembers(group.id);
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar miembros');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleMemberRoleChange = async (member: WAMember, newRole: string) => {
    try {
      await api.patchWAMember(member.id, { role: newRole });
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role: newRole } : m));
      toast.success('Rol actualizado');
    } catch {
      toast.error('Error');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{groups.length} grupo(s) encontrado(s)</p>
        <Button onClick={handleSync} disabled={syncing} variant="outline">
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sincronizar grupos
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {groups.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No hay grupos. Conecta WhatsApp y sincroniza.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-center">Miembros</TableHead>
                  <TableHead className="text-center">Pendientes</TableHead>
                  <TableHead className="text-center">Monitorear</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map(group => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>
                      <Select value={group.brand_id || '_none'} onValueChange={(v) => handleBrandChange(group, v)}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Sin marca" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Sin marca</SelectItem>
                          {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">{group.member_count}</TableCell>
                    <TableCell className="text-center">
                      {group.pending_count > 0 ? (
                        <Badge className="bg-red-100 text-red-800">{group.pending_count}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={!!group.is_monitored} onCheckedChange={() => handleToggleMonitor(group)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => openMembers(group)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Members Dialog */}
      <Dialog open={!!membersDialog} onOpenChange={() => setMembersDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Miembros del grupo
            </DialogTitle>
          </DialogHeader>
          {loadingMembers ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Nombre WA</TableHead>
                  <TableHead>Usuario TIUSDEI</TableHead>
                  <TableHead>Rol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.phone_number}</TableCell>
                    <TableCell>{m.wa_name || '-'}</TableCell>
                    <TableCell>
                      {m.user_nombre ? (
                        <span className="text-sm">{m.user_nombre}<br /><span className="text-xs text-muted-foreground">{m.user_email}</span></span>
                      ) : (
                        <span className="text-muted-foreground text-sm">No vinculado</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select value={m.role} onValueChange={(v) => handleMemberRoleChange(m, v)}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cliente">Cliente</SelectItem>
                          <SelectItem value="ejecutivo">Ejecutivo</SelectItem>
                          <SelectItem value="lider">Líder</SelectItem>
                          <SelectItem value="monitor">Monitor</SelectItem>
                          <SelectItem value="ignorar">Ignorar</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Inbox Tab ────────────────────────────────────────────────────────

function InboxTab() {
  const [messages, setMessages] = useState<WAMessage[]>([]);
  const [groups, setGroups] = useState<WAGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [slaFilter, setSlaFilter] = useState<string>('all');
  const [total, setTotal] = useState(0);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const [msgData, groupData] = await Promise.all([
        api.getWAMessages({ group_id: selectedGroup || undefined, sla: slaFilter, limit: 100 }),
        groups.length ? Promise.resolve(groups) : api.getWAGroups(),
      ]);
      setMessages(msgData.messages || []);
      setTotal(msgData.total || 0);
      if (!groups.length) setGroups(Array.isArray(groupData) ? groupData : []);
    } catch {
      toast.error('Error al cargar mensajes');
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, slaFilter, groups.length]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedGroup || '_all'} onValueChange={v => setSelectedGroup(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Todos los grupos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos los grupos</SelectItem>
            {groups.map(g => <SelectItem key={g.wa_group_id} value={g.wa_group_id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={slaFilter} onValueChange={setSlaFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="warning">Pendientes</SelectItem>
            <SelectItem value="breached">Vencidos</SelectItem>
            <SelectItem value="responded">Respondidos</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">{total} mensaje(s)</span>

        <Button variant="outline" size="sm" onClick={loadMessages}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : messages.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No hay mensajes{slaFilter !== 'all' ? ' con este filtro' : ''}.</p>
            </div>
          ) : (
            <div className="divide-y">
              {messages.map(msg => (
                <div key={msg.id} className={`p-4 flex gap-4 ${msg.is_from_client ? 'bg-orange-50/50 dark:bg-orange-950/10' : ''}`}>
                  <div className="flex-shrink-0 mt-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${msg.is_from_client ? 'bg-orange-200 text-orange-800' : 'bg-blue-200 text-blue-800'}`}>
                      {msg.is_from_client ? 'C' : 'E'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{msg.sender_name || msg.sender_phone}</span>
                      {msg.sender_role && roleBadge(msg.sender_role)}
                      <span className="text-xs text-muted-foreground">
                        {msg.group_name}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(msg.created_at).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm mt-1 break-words">{msg.message_text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {msg.is_from_client ? slaStatusBadge(msg.sla_status) : null}
                      {msg.sla_response_seconds != null && (
                        <span className="text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {formatTime(msg.sla_response_seconds)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── SLA Tab ──────────────────────────────────────────────────────────

function SlaTab() {
  const [rules, setRules] = useState<SlaRule[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [r, b] = await Promise.all([api.getWASlaRules(), api.getBrands()]);
        setRules(Array.isArray(r) ? r : []);
        setBrands(Array.isArray(b) ? b : []);
      } catch {
        toast.error('Error al cargar reglas SLA');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUpdate = async (rule: SlaRule, field: string, value: unknown) => {
    setSaving(rule.id);
    try {
      await api.patchWASlaRule(rule.id, { [field]: value });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, [field]: value } : r));
      toast.success('Actualizado');
    } catch {
      toast.error('Error');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const globalRule = rules.find(r => !r.brand_id && !r.wa_group_id);
  const brandRules = rules.filter(r => r.brand_id || r.wa_group_id);

  return (
    <div className="space-y-6">
      {/* Global rule */}
      {globalRule && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Regla Global (por defecto)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>SLA (minutos)</Label>
                <Input
                  type="number"
                  value={globalRule.sla_minutes}
                  onChange={e => handleUpdate(globalRule, 'sla_minutes', parseInt(e.target.value) || 30)}
                  min={1}
                />
              </div>
              <div>
                <Label>Horario inicio</Label>
                <Input
                  type="time"
                  value={globalRule.work_start}
                  onChange={e => handleUpdate(globalRule, 'work_start', e.target.value)}
                />
              </div>
              <div>
                <Label>Horario fin</Label>
                <Input
                  type="time"
                  value={globalRule.work_end}
                  onChange={e => handleUpdate(globalRule, 'work_end', e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-6 mt-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!globalRule.auto_create_task}
                  onCheckedChange={v => handleUpdate(globalRule, 'auto_create_task', v ? 1 : 0)}
                />
                <Label className="text-sm">Crear tarea automática al vencer SLA</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!globalRule.auto_notify_leader}
                  onCheckedChange={v => handleUpdate(globalRule, 'auto_notify_leader', v ? 1 : 0)}
                />
                <Label className="text-sm">Notificar al líder</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Brand-specific rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Reglas por marca
          </CardTitle>
        </CardHeader>
        <CardContent>
          {brandRules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No hay reglas específicas por marca. Se aplica la regla global.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marca/Grupo</TableHead>
                  <TableHead>SLA (min)</TableHead>
                  <TableHead>Horario</TableHead>
                  <TableHead>Auto-tarea</TableHead>
                  <TableHead>Notificar</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {brandRules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.brand_nombre || rule.group_name || '-'}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={rule.sla_minutes}
                        onChange={e => handleUpdate(rule, 'sla_minutes', parseInt(e.target.value) || 30)}
                        className="w-20"
                        min={1}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{rule.work_start} - {rule.work_end}</TableCell>
                    <TableCell>
                      <Switch checked={!!rule.auto_create_task} onCheckedChange={v => handleUpdate(rule, 'auto_create_task', v ? 1 : 0)} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={!!rule.auto_notify_leader} onCheckedChange={v => handleUpdate(rule, 'auto_notify_leader', v ? 1 : 0)} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={async () => {
                          if (!confirm('¿Eliminar esta regla?')) return;
                          try {
                            await api.deleteWASlaRule(rule.id);
                            setRules(prev => prev.filter(r => r.id !== rule.id));
                            toast.success('Eliminada');
                          } catch { toast.error('Error'); }
                        }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function WhatsApp() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CircleDot className="h-6 w-6 text-green-500" />
          WhatsApp Monitor
        </h1>
        <p className="text-muted-foreground text-sm">Supervisor silencioso de conversaciones de WhatsApp</p>
      </div>

      <Tabs defaultValue="conexion" className="space-y-4">
        <TabsList>
          <TabsTrigger value="conexion" className="gap-2"><Wifi className="h-4 w-4" /> Conexión</TabsTrigger>
          <TabsTrigger value="grupos" className="gap-2"><Users className="h-4 w-4" /> Grupos</TabsTrigger>
          <TabsTrigger value="inbox" className="gap-2"><MessageCircle className="h-4 w-4" /> Inbox</TabsTrigger>
          <TabsTrigger value="sla" className="gap-2"><Shield className="h-4 w-4" /> SLA</TabsTrigger>
        </TabsList>

        <TabsContent value="conexion"><ConnectionTab /></TabsContent>
        <TabsContent value="grupos"><GroupsTab /></TabsContent>
        <TabsContent value="inbox"><InboxTab /></TabsContent>
        <TabsContent value="sla"><SlaTab /></TabsContent>
      </Tabs>
    </div>
  );
}
