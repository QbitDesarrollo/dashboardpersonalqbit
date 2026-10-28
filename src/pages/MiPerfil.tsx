import { useState, useRef } from 'react';
import { IntegracionesCard } from '@/components/integraciones/IntegracionesCard';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { getInitials } from '@/lib/utils';
import {
  User, Camera, Trash2, Lock, Mail, Shield, Save, Loader2,
} from 'lucide-react';

function getRolLabel(rol: string) {
  const map: Record<string, string> = { admin: 'Administrador', ops: 'Operaciones', equipo: 'Equipo', cliente: 'Cliente' };
  return map[rol] || rol;
}

export default function MiPerfil() {
  const { profile, refreshProfile } = useAuth();
  const [nombre, setNombre] = useState(profile?.nombre || '');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  if (!profile) return null;

  const handleSaveName = async () => {
    const trimmed = nombre.trim();
    if (!trimmed) return toast.error('El nombre no puede estar vacío');
    if (trimmed === profile.nombre) return;
    setSavingName(true);
    try {
      await api.updateMyProfile(trimmed);
      await refreshProfile();
      toast.success('Nombre actualizado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSavingName(false);
    }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('La imagen no debe superar 5 MB');
    setUploadingAvatar(true);
    try {
      await api.uploadAvatar(file);
      await refreshProfile();
      toast.success('Foto actualizada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir foto');
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    setDeletingAvatar(true);
    try {
      await api.deleteAvatar();
      await refreshProfile();
      toast.success('Foto eliminada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar foto');
    } finally {
      setDeletingAvatar(false);
    }
  };

  const isGoogleOnly = !!profile.google_connected;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGoogleOnly && !currentPw) return toast.error('Ingresa tu contraseña actual');
    if (!newPw) return toast.error('Ingresa la nueva contraseña');
    if (newPw.length < 6) return toast.error('La nueva contraseña debe tener al menos 6 caracteres');
    if (newPw !== confirmPw) return toast.error('Las contraseñas no coinciden');
    setSavingPw(true);
    try {
      await api.changePassword(currentPw || undefined, newPw);
      toast.success(isGoogleOnly && !currentPw ? 'Contraseña establecida exitosamente' : 'Contraseña cambiada exitosamente');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar contraseña');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mi Perfil</h1>
        <p className="text-muted-foreground text-sm mt-1">Administra tu información personal y seguridad.</p>
      </div>

      {/* Avatar + Info card */}
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Avatar */}
            <div className="relative group">
              <Avatar className="h-28 w-28 border-4 border-primary/20">
                {profile.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={profile.nombre} className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-3xl font-bold">
                  {getInitials(profile.nombre)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>

            {/* Name + meta */}
            <div className="flex-1 text-center sm:text-left space-y-2">
              <h2 className="text-xl font-semibold">{profile.nombre}</h2>
              <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                <Badge variant="outline" className="gap-1">
                  <Mail className="h-3 w-3" />
                  {profile.email}
                </Badge>
                <Badge className="gap-1">
                  <Shield className="h-3 w-3" />
                  {getRolLabel(profile.rol)}
                </Badge>
                {profile.google_connected && (
                  <Badge variant="outline" className="text-green-600 border-green-300 gap-1">
                    Google conectado
                  </Badge>
                )}
              </div>
              {profile.avatar_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive text-xs mt-1"
                  onClick={handleDeleteAvatar}
                  disabled={deletingAvatar}
                >
                  {deletingAvatar ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                  Eliminar foto
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <IntegracionesCard />

      {/* Edit name */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Información Personal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre completo</Label>
            <div className="flex gap-2">
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre completo"
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              />
              <Button onClick={handleSaveName} disabled={savingName || nombre.trim() === profile.nombre}>
                {savingName ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Guardar
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Correo electrónico</Label>
            <Input value={profile.email} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">El correo no se puede cambiar.</p>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {isGoogleOnly ? 'Establecer Contraseña' : 'Cambiar Contraseña'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isGoogleOnly && (
            <p className="text-sm text-muted-foreground mb-4">
              Iniciaste sesión con Google. Puedes establecer una contraseña para también ingresar con tu correo y contraseña.
            </p>
          )}
          <form onSubmit={handleChangePassword} className="space-y-4">
            {!isGoogleOnly && (
              <div className="space-y-2">
                <Label htmlFor="current-pw">Contraseña actual</Label>
                <Input
                  id="current-pw"
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-pw">{isGoogleOnly ? 'Contraseña' : 'Nueva contraseña'}</Label>
                <Input
                  id="new-pw"
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pw">Confirmar contraseña</Label>
                <Input
                  id="confirm-pw"
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Repite la contraseña"
                />
              </div>
            </div>
            <Button type="submit" disabled={savingPw || (!isGoogleOnly && !currentPw) || !newPw || !confirmPw}>
              {savingPw ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
              {isGoogleOnly ? 'Establecer Contraseña' : 'Cambiar Contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
