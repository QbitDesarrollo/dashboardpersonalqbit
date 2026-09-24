import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DEV_TEAM_OWNER_IDS } from '@/lib/devTeam';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { cn } from '@/lib/utils';
import * as api from '@/lib/apiClient';
import { playNotificationSound, type SoundType, SOUND_TYPES } from '@/lib/notificationSound';
import {
  requestNotificationPermission,
  showNativeNotification,
  updateBadgeCount,
  isNotificationSupported,
  isPermissionGranted,
} from '@/lib/nativeNotifications';
import {
  getNotifications,
  getNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '@/lib/api';
import {
  LayoutDashboard,
  CheckSquare,
  FileBox,
  Files,
  FileText,
  LayoutTemplate,
  Zap,
  MessageCircle,
  Users,
  Building2,
  Tags,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Briefcase,
  BarChart3,
  MonitorCheck,
  Pin,
  PinOff,
  Check,
  Target,
  Sun,
  Moon,
  UserCog,
  Phone,
  TrendingUp,
  Bug,
  Sparkles,
  Workflow,
  FolderKanban,
  Plug,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GlobalSearch } from '@/components/GlobalSearch';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { GeminiPanel } from '@/components/gemini/GeminiPanel';
import { TimeSessionProvider, useTimeSession } from '@/contexts/TimeSessionContext';
import { GlobalTimerGuard } from '@/components/GlobalTimerGuard';
import { CheckInWidget } from '@/components/time-doctor/CheckInWidget';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  roles?: ('admin' | 'ejecutivo' | 'equipo' | 'cliente')[];
  onlyUserIds?: string[]; // visible solo para estos usuarios (además del rol)
}

// La seccion MCP es solo para los admins y las mesas listadas aqui.
// El nombre va como respaldo: si la mesa se recrea, su uuid cambia.
const MCP_DESKS: { id: string; nombre: string }[] = [
  { id: 'e8e49f2e-465c-44bd-86ef-e560c7876431', nombre: 'pycca' },
  { id: 'f643ac78-df27-4613-8475-a328aabc9b8c', nombre: 'desarrollo' },
];

const navigation: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { title: 'Mi equipo', href: '/mi-equipo', icon: <Users className="h-5 w-5" />, roles: ['admin'], onlyUserIds: DEV_TEAM_OWNER_IDS },
  { title: 'Equipo por mesa', href: '/equipo-mesas', icon: <Users className="h-5 w-5" />, roles: ['admin', 'ejecutivo'] },
  { title: 'Tareas', href: '/tareas', icon: <CheckSquare className="h-5 w-5" />, roles: ['admin', 'ejecutivo', 'equipo'] },
  { title: 'Pipeline', href: '/tareas/pipeline', icon: <Workflow className="h-5 w-5" />, roles: ['admin', 'ejecutivo', 'equipo'] },
  { title: 'Proyectos', href: '/proyectos', icon: <FolderKanban className="h-5 w-5" />, roles: ['admin', 'ejecutivo', 'equipo'] },
  { title: 'Scrum', href: '/scrum', icon: <Target className="h-5 w-5" />, roles: ['admin', 'ejecutivo', 'equipo'] },
  { title: 'Daily Mesas', href: '/daily-mesas', icon: <Users className="h-5 w-5" />, roles: ['admin', 'ejecutivo'] },
  { title: 'Cumplimiento', href: '/informes/cumplimiento', icon: <TrendingUp className="h-5 w-5" />, roles: ['admin', 'ejecutivo', 'equipo'] },
  { title: 'Tiempo por marca', href: '/informes/tiempo-marcas', icon: <BarChart3 className="h-5 w-5" />, roles: ['admin', 'ejecutivo'] },
  { title: 'MCP', href: '/mcp', icon: <Plug className="h-5 w-5" />, roles: ['admin', 'ejecutivo', 'equipo'] },
  { title: 'Clientes', href: '/clientes', icon: <Users className="h-5 w-5" />, roles: ['admin', 'ejecutivo'] },
  { title: 'Incidencias', href: '/incidencias', icon: <Bug className="h-5 w-5" />, roles: ['admin', 'ejecutivo', 'equipo'] },
  { title: 'Novedades', href: '/novedades', icon: <Sparkles className="h-5 w-5" />, roles: ['admin', 'ejecutivo'] },
  // { title: 'Mi Dashboard', href: '/mi-dashboard', icon: <BarChart3 className="h-5 w-5" />, roles: ['admin', 'ejecutivo', 'equipo'] },
  { title: 'Portal Cliente', href: '/cliente', icon: <Briefcase className="h-5 w-5" />, roles: ['cliente'] },
];

const adminNavigation: NavItem[] = [
  { title: 'Usuarios', href: '/admin/usuarios', icon: <Users className="h-5 w-5" /> },
  { title: 'Clientes', href: '/admin/clientes', icon: <Building2 className="h-5 w-5" /> },
  { title: 'Marcas', href: '/admin/marcas', icon: <Tags className="h-5 w-5" /> },
  { title: 'Mesas', href: '/admin/mesas', icon: <LayoutDashboard className="h-5 w-5" /> },
  { title: 'Integraciones', href: '/admin/integraciones', icon: <MessageCircle className="h-5 w-5" /> },
  { title: 'Automatizaciones', href: '/admin/automatizaciones', icon: <Zap className="h-5 w-5" /> },
  { title: 'Consola de errores', href: '/admin/errores', icon: <Bug className="h-5 w-5" />, roles: ['admin'] },
  { title: 'Formularios públicos', href: '/admin/formularios', icon: <FileText className="h-5 w-5" /> },
  { title: 'WhatsApp', href: '/admin/whatsapp', icon: <Phone className="h-5 w-5" /> },
  { title: 'Monitor Equipo', href: '/admin/monitor', icon: <MonitorCheck className="h-5 w-5" /> },
  { title: 'Configuración', href: '/admin/configuracion', icon: <Settings className="h-5 w-5" /> },
];

interface Desk {
  id: string;
  nombre: string;
}

interface Brand {
  id: string;
  nombre: string;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, isAdmin, isEjecutivo } = useAuth();
  const { pinnedDeskId, pinnedBrandId, pinnedDeskName, pinnedBrandName, setPinnedDesk, setPinnedBrand, clearFilters, hasActiveFilter } = useGlobalFilter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [pinnedMenuOpen, setPinnedMenuOpen] = useState(true);
  const [brandsMenuOpen, setBrandsMenuOpen] = useState(false);
  const [desks, setDesks] = useState<Desk[]>([]);
  // Orden personal de las mesas del sidebar (drag & drop, por usuario)
  const [deskOrder, setDeskOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('sidebar_mesas_order') || '[]'); } catch { return []; }
  });
  const dragDeskId = useRef<string | null>(null);
  const orderedDesks = (() => {
    if (deskOrder.length === 0) return desks;
    const pos: Record<string, number> = {};
    deskOrder.forEach((id, i) => { pos[id] = i; });
    return [...desks].sort((a, b) => (pos[a.id] ?? 999) - (pos[b.id] ?? 999));
  })();
  const moveDesk = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = orderedDesks.map((d) => d.id);
    const from = ids.indexOf(fromId); const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDeskOrder(ids);
    try { localStorage.setItem('sidebar_mesas_order', JSON.stringify(ids)); } catch {}
  };
  const [brands, setBrands] = useState<Brand[]>([]);
  const [siteSettings, setSiteSettings] = useState<{ logo_url?: string | null; site_name?: string | null }>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const incidenciasUnread = notifications.filter((n) => !n.leida && (n.mensaje || '').toLowerCase().includes('incidencia')).length;
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef<ReturnType<typeof import('socket.io-client').io> | null>(null);
  const notifSoundEnabledRef = useRef(true);
  const notifSoundTypeRef = useRef<SoundType>('chime');
  const [chatEnabled, setChatEnabled] = useState(false);
  const [geminiEnabled, setGeminiEnabled] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const signal = ac.signal;

    const fetchNotifications = async () => {
      try {
        const [notifResult, countResult] = await Promise.all([
          getNotifications({ limit: 10, signal }),
          getNotificationCount({ signal }),
        ]);
        if (signal.aborted) return;
        setNotifications(notifResult.notifications || []);
        setUnreadCount(countResult.count || 0);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    };

    const fetchData = async () => {
      const [desksData, brandsData, settings] = await Promise.all([
        api.getDesks(),
        api.getBrands(),
        api.getSiteSettings().catch(() => ({})),
      ]);
      if (Array.isArray(desksData)) setDesks(desksData.filter((d: { activo?: boolean }) => d.activo));
      if (Array.isArray(brandsData)) setBrands(brandsData.filter((b: { activo?: boolean }) => b.activo));
      if (settings && typeof settings === 'object') {
        setSiteSettings(settings);
        notifSoundEnabledRef.current = settings.notification_sound_enabled !== 'false';
        const st = settings.notification_sound_type;
        if (st && SOUND_TYPES.includes(st as SoundType)) notifSoundTypeRef.current = st as SoundType;
        setChatEnabled(settings.chat_enabled === 'true');
        setGeminiEnabled(settings.gemini_enabled === 'true');
      }
    };
    fetchData();
    fetchNotifications();

    // Escuchar notificaciones en tiempo real (menciones, asignaciones, etc.)
    const token = localStorage.getItem('tiusdei_token');
    if (token) {
      const API_URL = (import.meta as any).env?.VITE_API_URL || window.location.origin;
      import('socket.io-client').then(({ io }) => {
        if (signal.aborted) return;
        const socket = io(API_URL.replace(/\/$/, ''), {
          auth: { token },
          transports: ['websocket', 'polling'],
        });
        socket.on('notification:new', (notif: Notification) => {
          setNotifications(prev => [notif, ...prev].slice(0, 20));
          setUnreadCount(prev => {
            const next = prev + 1;
            updateBadgeCount(next);
            return next;
          });
          if (notifSoundEnabledRef.current) {
            playNotificationSound(notifSoundTypeRef.current);
          }
          showNativeNotification({
            title: 'Tiusdei',
            body: notif.mensaje,
            tag: `notif-${notif.id}`,
            data: notif.mensaje?.includes('en el chat de')
              ? { type: 'chat', deskName: notif.mensaje.match(/en el chat de (.+)$/)?.[1] || '', url: '/' }
              : { type: 'task', url: '/tareas' },
          });
        });
        socketRef.current = socket;
      }).catch(() => {});
    }

    const interval = setInterval(fetchNotifications, 60000);
    return () => {
      clearInterval(interval);
      ac.abort();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isNotificationSupported() && !isPermissionGranted()) {
      const timer = setTimeout(() => requestNotificationPermission(), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'open-desk-chat') {
        window.dispatchEvent(new CustomEvent('open-desk-chat', { detail: { deskName: e.data.deskName || '' } }));
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silently fail
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, leida: true })));
      setUnreadCount(0);
      updateBadgeCount(0);
    } catch {
      // silently fail
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const filteredNav = navigation.filter(item => {
    if (item.onlyUserIds && !(profile && item.onlyUserIds.includes(profile.id))) return false;
    if (item.href === '/mcp') {
      // MCP: solo admins o miembros de una mesa con acceso
      const enMesaConMcp = desks.some((d) =>
        MCP_DESKS.some(
          (m) => d.id === m.id || (d.nombre || '').toLowerCase().includes(m.nombre),
        ),
      );
      return profile?.rol === 'admin' || enMesaConMcp;
    }
    if (!item.roles) return true;
    return profile && item.roles.includes(profile.rol);
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const { setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Auto theme by Guayaquil time (UTC-5): dark 18:00-06:00, light 06:00-18:00
  useEffect(() => {
    const getGyeHour = () => {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      return new Date(utc - 5 * 3600000).getHours();
    };
    const apply = () => {
      try {
        // Si la persona eligio su tema con el boton, se respeta SIEMPRE
        // (antes este auto lo pisaba cada 60s: "el modo oscuro dura 5 min").
        if (localStorage.getItem('tiusdei_theme_manual')) return;
        const h = getGyeHour();
        setTheme(h >= 18 || h < 6 ? 'dark' : 'light');
      } catch {}
    };
    const timeout = setTimeout(apply, 500);
    const interval = setInterval(apply, 60000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, []);

  // La barra superior de la app instalada (PWA) toma su color de este meta.
  // Sin esto quedaba azul fija y desentonaba con la interfaz (incidencia 35424cf0).
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'dark' ? '#0b1120' : '#ffffff');
  }, [resolvedTheme]);

  const getRoleBadge = (rol: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-primary text-primary-foreground',
      ejecutivo: 'bg-info text-info-foreground',
      equipo: 'bg-success text-success-foreground',
      cliente: 'bg-warning text-warning-foreground',
    };
    return colors[rol] || 'bg-muted text-muted-foreground';
  };

  return (
    <TimeSessionProvider>
    <div className="h-screen bg-background flex flex-col lg:flex-row w-full overflow-x-hidden">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-sidebar-border transform transition-all duration-300 ease-in-out lg:static lg:z-auto",
          sidebarCollapsed ? "lg:w-0 lg:border-r-0 lg:overflow-hidden" : "lg:w-64",
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
            <Link to="/dashboard" className="flex items-center gap-3 min-w-0">
              {siteSettings.logo_url ? (
                <img src={siteSettings.logo_url} alt={siteSettings.site_name || 'TIUSDEI'} className="h-9 w-auto max-w-[140px] object-contain" />
              ) : (
                <div className="p-2 rounded-lg gradient-primary shrink-0">
                  <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <span className="font-bold text-foreground truncate">{siteSettings.site_name || 'TIUSDEI'}</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className="px-3 space-y-1">
              {filteredNav.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    location.pathname === item.href
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  {item.icon}
                  {item.title}
                  {/* Indicador de novedades de incidencias (pedido de Steven): cuenta
                      las notificaciones de incidencias sin leer; se limpia al leerlas. */}
                  {item.href === '/incidencias' && incidenciasUnread > 0 && (
                    <span className="ml-auto min-w-[18px] text-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                      {incidenciasUnread}
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            {/* Pinned Filters Section */}
            <div className="mt-6 px-3">
              <button
                onClick={() => setPinnedMenuOpen(!pinnedMenuOpen)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Pin className="h-3 w-3" />
                  Filtros Globales
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    pinnedMenuOpen && "rotate-180"
                  )}
                />
              </button>
              {pinnedMenuOpen && (
                <div className="mt-2 space-y-3">
                  {/* Active filters display */}
                  {hasActiveFilter && (
                    <div className="px-3 py-2 bg-primary/10 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-primary">Filtros activos</span>
                        <button
                          onClick={clearFilters}
                          className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                        >
                          <PinOff className="h-3 w-3" />
                          Limpiar
                        </button>
                      </div>
                      {pinnedDeskName && (
                        <div className="text-xs text-foreground flex items-center gap-1 mb-1">
                          <LayoutDashboard className="h-3 w-3" />
                          Mesa: <span className="font-medium">{pinnedDeskName}</span>
                        </div>
                      )}
                      {pinnedBrandName && (
                        <div className="text-xs text-foreground flex items-center gap-1">
                          <Tags className="h-3 w-3" />
                          Marca: <span className="font-medium">{pinnedBrandName}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Desk selection */}
                  <div className="space-y-1">
                    <span className="px-3 text-xs text-muted-foreground">Mesas</span>
                    {orderedDesks.map((desk) => (
                      <button
                        key={desk.id}
                        draggable
                        onDragStart={() => { dragDeskId.current = desk.id; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); if (dragDeskId.current) moveDesk(dragDeskId.current, desk.id); dragDeskId.current = null; }}
                        title="Arrastra para reordenar tus mesas"
                        onClick={() => {
                          if (pinnedDeskId === desk.id) {
                            setPinnedDesk(null, null);
                          } else {
                            setPinnedDesk(desk.id, desk.nombre);
                            navigate('/tareas');
                          }
                          setSidebarOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors",
                          pinnedDeskId === desk.id
                            ? "bg-primary text-primary-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <LayoutDashboard className="h-4 w-4" />
                          {desk.nombre}
                        </span>
                        {pinnedDeskId === desk.id && <Pin className="h-3 w-3" />}
                      </button>
                    ))}
                  </div>

                  {/* Brand selection */}
                  <div className="space-y-1">
                    <button
                      onClick={() => setBrandsMenuOpen(!brandsMenuOpen)}
                      className="flex items-center justify-between w-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>Marcas</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", brandsMenuOpen && "rotate-180")} />
                    </button>
                    {brandsMenuOpen && brands.map((brand) => (
                      <button
                        key={brand.id}
                        onClick={() => {
                          if (pinnedBrandId === brand.id) {
                            setPinnedBrand(null, null);
                          } else {
                            setPinnedBrand(brand.id, brand.nombre);
                          }
                        }}
                        className={cn(
                          "flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors",
                          pinnedBrandId === brand.id
                            ? "bg-primary text-primary-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Tags className="h-4 w-4" />
                          {brand.nombre}
                        </span>
                        {pinnedBrandId === brand.id && <Pin className="h-3 w-3" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Admin section */}
            {(isAdmin || isEjecutivo) && (
              <div className="mt-6 px-3">
                <button
                  onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  <span>Administración</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      adminMenuOpen && "rotate-180"
                    )}
                  />
                </button>
                {adminMenuOpen && (
                  <nav className="mt-1 space-y-1">
                    {adminNavigation.map((item) => (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                          location.pathname === item.href
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                        )}
                        onClick={() => setSidebarOpen(false)}
                      >
                        {item.icon}
                        {item.title}
                      </Link>
                    ))}
                  </nav>
                )}
              </div>
            )}
          </ScrollArea>

          {/* User section */}
          <div className="p-4 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors">
                  <Avatar className="h-9 w-9">
                    {profile?.avatar_url ? (
                      <AvatarImage src={profile.avatar_url} alt={profile.nombre} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {profile?.nombre ? getInitials(profile.nombre) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground truncate">
                      {profile?.nombre || 'Usuario'}
                    </p>
                    <Badge className={cn("text-[10px] px-1.5", getRoleBadge(profile?.rol || ''))}>
                      {profile?.rol?.toUpperCase()}
                    </Badge>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/perfil')}>
                  <UserCog className="mr-2 h-4 w-4" />
                  Mi Perfil
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar Sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 w-full lg:w-auto">
        {/* Header */}
        <header className="h-14 sm:h-16 shrink-0 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="h-full px-3 sm:px-4 flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={toggleSidebarCollapse}
                title={sidebarCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </Button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">
                  {filteredNav.find(n => n.href === location.pathname)?.title || 
                   adminNavigation.find(n => n.href === location.pathname)?.title || 
                   'TIUSDEI Portal'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <GlobalSearch />
              {profile?.rol === 'admin' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate('/admin/monitor')}
                  title="Monitor de equipo"
                >
                  <MonitorCheck className="h-5 w-5" />
                </Button>
              )}
              {profile?.rol && ['admin', 'ejecutivo', 'equipo'].includes(profile.rol) && (
                <CheckInWidget />
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const next = isDark ? 'light' : 'dark';
                  try { localStorage.setItem('tiusdei_theme_manual', next); } catch {}
                  setTheme(next);
                }}
                title={isDark ? 'Modo claro (normal)' : 'Modo oscuro'}
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Popover open={notifOpen} onOpenChange={setNotifOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-destructive rounded-full text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-2rem)] max-w-96 p-0 max-h-[80vh] flex flex-col" align="end" sideOffset={8}>
                  <div className="flex items-center justify-between p-3 border-b border-border">
                    <h4 className="font-semibold text-sm">Notificaciones</h4>
                    {unreadCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleMarkAllRead}>
                        <Check className="h-3 w-3 mr-1" />
                        Marcar todas
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="flex-1 h-[min(70vh,500px)]">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        Sin notificaciones
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {notifications.map((notif) => (
                          <button
                            key={notif.id}
                            onClick={() => {
                              if (!notif.leida) handleMarkRead(notif.id);
                              if (notif.mensaje?.includes('en el chat de')) {
                                const match = notif.mensaje.match(/en el chat de (.+)$/);
                                const deskName = match?.[1] || '';
                                window.dispatchEvent(new CustomEvent('open-desk-chat', { detail: { deskName } }));
                              } else if (notif.task_id) {
                                navigate(`/tareas?task=${notif.task_id}`);
                                setNotifOpen(false);
                              } else if (notif.mensaje?.toLowerCase().includes('incidencia')) {
                                navigate('/incidencias');
                                setNotifOpen(false);
                              }
                            }}
                            className={cn(
                              "w-full text-left p-3 hover:bg-muted/50 transition-colors",
                              !notif.leida && "bg-primary/5"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              {!notif.leida && (
                                <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                              )}
                              <div className={cn("flex-1 min-w-0", notif.leida && "ml-4")}>
                                <p className="text-sm text-foreground line-clamp-2">{notif.mensaje}</p>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {new Date(notif.created_at).toLocaleDateString('es-ES', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden overflow-y-auto min-h-0">
          {children}
        </main>
        <GlobalTimerGuard />
      </div>

      {/* Floating chat bubble */}
      {chatEnabled && (
        <ChatBubble soundEnabled={notifSoundEnabledRef.current} soundType={notifSoundTypeRef.current} />
      )}

      {/* Gemini AI panel */}
      {geminiEnabled && <GeminiPanel />}
    </div>
    </TimeSessionProvider>
  );
}
