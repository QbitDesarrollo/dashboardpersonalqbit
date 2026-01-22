import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFilter } from '@/contexts/GlobalFilterContext';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutDashboard,
  CheckSquare,
  FileBox,
  Files,
  Users,
  Building2,
  Tags,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Bell,
  Briefcase,
  Pin,
  PinOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  roles?: ('admin' | 'ops' | 'equipo' | 'cliente')[];
}

const navigation: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { title: 'Tareas', href: '/tareas', icon: <CheckSquare className="h-5 w-5" />, roles: ['admin', 'ops', 'equipo'] },
  { title: 'Entregables', href: '/entregables', icon: <FileBox className="h-5 w-5" />, roles: ['admin', 'ops', 'equipo'] },
  { title: 'Archivos', href: '/archivos', icon: <Files className="h-5 w-5" />, roles: ['admin', 'ops', 'equipo'] },
  { title: 'Portal Cliente', href: '/cliente', icon: <Briefcase className="h-5 w-5" />, roles: ['cliente'] },
];

const adminNavigation: NavItem[] = [
  { title: 'Usuarios', href: '/admin/usuarios', icon: <Users className="h-5 w-5" /> },
  { title: 'Clientes', href: '/admin/clientes', icon: <Building2 className="h-5 w-5" /> },
  { title: 'Marcas', href: '/admin/marcas', icon: <Tags className="h-5 w-5" /> },
  { title: 'Mesas', href: '/admin/mesas', icon: <LayoutDashboard className="h-5 w-5" /> },
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
  const { profile, signOut, isAdmin, isOps } = useAuth();
  const { pinnedDeskId, pinnedBrandId, pinnedDeskName, pinnedBrandName, setPinnedDesk, setPinnedBrand, clearFilters, hasActiveFilter } = useGlobalFilter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [pinnedMenuOpen, setPinnedMenuOpen] = useState(true);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [desksRes, brandsRes] = await Promise.all([
        supabase.from('desks').select('id, nombre').eq('activo', true),
        supabase.from('brands').select('id, nombre').eq('activo', true),
      ]);
      if (desksRes.data) setDesks(desksRes.data);
      if (brandsRes.data) setBrands(brandsRes.data);
    };
    fetchData();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const filteredNav = navigation.filter(item => {
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

  const getRoleBadge = (rol: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-primary text-primary-foreground',
      ops: 'bg-info text-info-foreground',
      equipo: 'bg-success text-success-foreground',
      cliente: 'bg-warning text-warning-foreground',
    };
    return colors[rol] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="min-h-screen bg-background flex">
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
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="p-2 rounded-lg gradient-primary">
                <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">TIUSDEI</span>
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
                    {desks.map((desk) => (
                      <button
                        key={desk.id}
                        onClick={() => {
                          if (pinnedDeskId === desk.id) {
                            setPinnedDesk(null, null);
                          } else {
                            setPinnedDesk(desk.id, desk.nombre);
                          }
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
                    <span className="px-3 text-xs text-muted-foreground">Marcas</span>
                    {brands.slice(0, 8).map((brand) => (
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
            {(isAdmin || isOps) && (
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
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="h-full px-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {filteredNav.find(n => n.href === location.pathname)?.title || 
                   adminNavigation.find(n => n.href === location.pathname)?.title || 
                   'TIUSDEI Portal'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 h-2 w-2 bg-destructive rounded-full" />
              </Button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
