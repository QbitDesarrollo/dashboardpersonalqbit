import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, LayoutDashboard, Sun, Moon, Chrome } from 'lucide-react';
import { useTheme } from 'next-themes';

export default function Login() {
  const { signIn, signUp, user, loading } = useAuth();
  const { setTheme, resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const isDark = resolvedTheme === 'dark';

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupNombre, setSignupNombre] = useState('');

  const [siteSettings, setSiteSettings] = useState<{
    logo_url?: string | null;
    logo_email_url?: string | null;
    site_name?: string | null;
    registration_enabled?: string | null;
    registration_allowed_domains?: string | null;
  }>({});
  useEffect(() => {
    api.getSiteSettings()
      .then((s) => setSiteSettings(typeof s === 'object' ? s : {}))
      .catch(() => {});
  }, []);

  // Mostrar errores de Google OAuth redirect
  useEffect(() => {
    const errorCode = searchParams.get('error');
    if (!errorCode) return;
    const messages: Record<string, string> = {
      domain_not_allowed: 'Solo se permiten correos con dominio @qbit.com.ec',
      registration_disabled: 'El registro de nuevas cuentas está deshabilitado',
      max_users: 'Se ha alcanzado el límite máximo de usuarios',
      google_auth_failed: 'Error al autenticar con Google. Intenta de nuevo',
      no_code: 'No se recibió código de autorización de Google',
      no_email: 'No se pudo obtener el email de la cuenta de Google',
    };
    toast.error(messages[errorCode] || 'Error de autenticación');
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const registrationEnabled = siteSettings.registration_enabled === 'true';
  const allowedDomains = (siteSettings.registration_allowed_domains || '')
    .split(/[,\s]+/)
    .map((d) => d.trim().replace(/^@/, ''))
    .filter(Boolean);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const { error } = await signIn(loginEmail, loginPassword);
    
    if (error) {
      toast.error('Error al iniciar sesión', {
        description: error.message
      });
    } else {
      toast.success('Bienvenido de vuelta');
      navigate('/dashboard');
    }
    
    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const { error } = await signUp(signupEmail, signupPassword, signupNombre);
    
    if (error) {
      toast.error('Error al registrarse', {
        description: error.message
      });
    } else {
      toast.success('Cuenta creada exitosamente');
      navigate('/dashboard');
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        title={isDark ? 'Modo claro (normal)' : 'Modo oscuro'}
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center justify-center gap-4 mb-8">
          {(siteSettings.logo_url || siteSettings.logo_email_url) ? (
            <img src={(siteSettings.logo_url || siteSettings.logo_email_url)!} alt={siteSettings.site_name || 'TIUSDEI'} className="h-16 w-auto max-w-[220px] object-contain" />
          ) : (
            <div className="p-3 rounded-xl gradient-primary">
              <LayoutDashboard className="h-8 w-8 text-primary-foreground" />
            </div>
          )}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">{siteSettings.site_name || 'TIUSDEI'} Portal</h1>
            <p className="text-sm text-muted-foreground">Gestión de tareas y entregables</p>
          </div>
        </div>

        <Card className="glass-card">
          <Tabs defaultValue="login" className="w-full">
            <CardHeader className="pb-4">
              <TabsList className={registrationEnabled ? 'grid w-full grid-cols-2' : 'w-full'}>
                <TabsTrigger value="login">Iniciar Sesión</TabsTrigger>
                {registrationEnabled && <TabsTrigger value="signup">Registrarse</TabsTrigger>}
              </TabsList>
            </CardHeader>
            
            <CardContent>
              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Contraseña</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Iniciar Sesión
                  </Button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">o</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      const base = import.meta.env.VITE_API_URL || window.location.origin;
                      window.location.href = `${base}/api/auth/google`;
                    }}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Iniciar con Google
                  </Button>
                </form>
              </TabsContent>
              
              {registrationEnabled && (
              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSignup} className="space-y-4">
                  {allowedDomains.length > 0 && (
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                      Solo correos con dominios: {allowedDomains.map((d) => `@${d}`).join(', ')}
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="signup-nombre">Nombre</Label>
                    <Input
                      id="signup-nombre"
                      type="text"
                      placeholder="Tu nombre completo"
                      value={signupNombre}
                      onChange={(e) => setSignupNombre(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Contraseña</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Crear Cuenta
                  </Button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">o</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      const base = import.meta.env.VITE_API_URL || window.location.origin;
                      window.location.href = `${base}/api/auth/google?mode=register`;
                    }}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Registrarse con Google
                  </Button>
                </form>
              </TabsContent>
              )}
            </CardContent>
          </Tabs>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Sistema de gestión de agencia
        </p>
      </div>
    </div>
  );
}
