import React, { createContext, useContext, useEffect, useState } from 'react';
import * as api from '@/lib/apiClient';

type AppRole = 'admin' | 'ops' | 'equipo' | 'cliente';

interface Profile {
  id: string;
  nombre: string;
  email: string;
  rol: AppRole;
  activo: boolean;
  avatar_url?: string | null;
  google_connected?: boolean;
}

interface AuthContextType {
  user: { id: string; email: string; nombre: string } | null;
  session: { access_token: string } | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, nombre: string, rol?: AppRole) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isOps: boolean;
  isEquipo: boolean;
  isCliente: boolean;
  canManageTasks: boolean;
  canViewAll: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string; nombre: string } | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tiusdei_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.getMe()
      .then((data: any) => {
        if (data.error) {
          localStorage.removeItem('tiusdei_token');
          setSession(null);
          setUser(null);
          setProfile(null);
        } else {
          setSession({ access_token: token });
          setUser({ id: data.id, email: data.email, nombre: data.nombre });
          setProfile({ ...data, activo: data.activo !== false });
        }
      })
      .catch(() => {
        localStorage.removeItem('tiusdei_token');
        setSession(null);
        setUser(null);
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const data: any = await api.login(email, password);
      if (data.error) return { error: new Error(data.error) };
      localStorage.setItem('tiusdei_token', data.token);
      setSession({ access_token: data.token });
      setUser(data.user);
      setProfile({ ...data.user, activo: true });
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('Error al iniciar sesión') };
    }
  };

  const signUp = async (email: string, password: string, nombre: string, rol: AppRole = 'equipo') => {
    try {
      const data: any = await api.register(email, password, nombre, rol);
      if (data.error) return { error: new Error(data.error) };
      localStorage.setItem('tiusdei_token', data.token);
      setSession({ access_token: data.token });
      setUser(data.user);
      setProfile({ ...data.user, activo: true });
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error('Error al registrarse') };
    }
  };

  const signOut = async () => {
    localStorage.removeItem('tiusdei_token');
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    try {
      const data: any = await api.getMe();
      if (!data.error) {
        setUser({ id: data.id, email: data.email, nombre: data.nombre });
        setProfile({ ...data, activo: data.activo !== false });
      }
    } catch { /* ignore */ }
  };

  const isAdmin = profile?.rol === 'admin';
  const isOps = profile?.rol === 'ops';
  const isEquipo = profile?.rol === 'equipo';
  const isCliente = profile?.rol === 'cliente';
  const canManageTasks = isAdmin || isOps || isEquipo;
  const canViewAll = isAdmin || isOps;

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      isAdmin,
      isOps,
      isEquipo,
      isCliente,
      canManageTasks,
      canViewAll,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
