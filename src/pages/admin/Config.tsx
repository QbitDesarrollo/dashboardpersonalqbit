import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import * as api from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Edit, Trash2, Loader2, FileBox, CheckSquare, Image, Mail, Upload, UserPlus, LayoutGrid, Video, Bell, Volume2, VolumeX, MessageCircle, FolderOpen, Sparkles } from 'lucide-react';
import { playNotificationSound, SOUND_TYPES, SOUND_LABELS, type SoundType } from '@/lib/notificationSound';

interface ItemType {
  id: string;
  nombre: string;
  activo: boolean;
}

interface EmailTemplate {
  id: string;
  type: string;
  subject_template: string;
  html_template: string | null;
  updated_at: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  task_assignment: 'Tarea asignada',
  deadline_warning: 'Aviso deadline',
  status_change: 'Cambio de estado',
  deliverable_approved: 'Entregable aprobado',
};

interface TypeDialogProps {
  type: 'task' | 'deliverable';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  formData: { nombre: string; activo: boolean };
  setFormData: React.Dispatch<React.SetStateAction<{ nombre: string; activo: boolean }>>;
  selectedItem: { type: 'task' | 'deliverable'; item: ItemType } | null;
  saving: boolean;
  onSubmit: (t: 'task' | 'deliverable') => void;
}

function TypeDialogComponent({ type, open, onOpenChange, onClose, formData, setFormData, selectedItem, saving, onSubmit }: TypeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) onClose();
    }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          Añadir
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby="config-type-desc">
        <DialogHeader>
          <DialogTitle>
            {selectedItem ? 'Editar' : 'Nuevo'} Tipo de {type === 'task' ? 'Tarea' : 'Entregable'}
          </DialogTitle>
          <DialogDescription id="config-type-desc">Define un nuevo tipo o edita uno existente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(type); }} className="space-y-4" autoComplete="off">
          <div className="space-y-2">
            <Label htmlFor="config-type-nombre">Nombre *</Label>
            <Input
              id="config-type-nombre"
              value={formData.nombre}
              onChange={(e) => setFormData((prev) => ({ ...prev, nombre: e.target.value }))}
              required
              autoComplete="off"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Activo</Label>
            <Switch
              checked={formData.activo}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, activo: checked }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {selectedItem ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminConfig() {
  const [taskTypes, setTaskTypes] = useState<ItemType[]>([]);
  const [deliverableTypes, setDeliverableTypes] = useState<ItemType[]>([]);
  const [siteSettings, setSiteSettings] = useState<Record<string, string | null>>({});
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [delDialogOpen, setDelDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', activo: true });
  const [selectedItem, setSelectedItem] = useState<{ type: 'task' | 'deliverable'; item: ItemType } | null>(null);

  const [appearanceForm, setAppearanceForm] = useState({
    logo_url: '',
    logo_email_url: '',
    favicon_url: '',
    site_name: 'TIUSDEI',
    email_from_name: 'TIUSDEI',
    email_footer_text: 'TIUSDEI Portal · Notificación automática',
  });
  const [appearanceSaving, setAppearanceSaving] = useState(false);

  const [registrationForm, setRegistrationForm] = useState({
    registration_enabled: false,
    registration_allowed_domains: 'qbit.com.ec',
    registration_max_users: 0,
  });
  const [registrationSaving, setRegistrationSaving] = useState(false);

  const [permissionsForm, setPermissionsForm] = useState({
    can_delete_admin: true,
    can_delete_ops: true,
    can_delete_equipo: false,
  });
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  const [templateEditOpen, setTemplateEditOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ subject_template: '', html_template: '' });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templatePreviewTab, setTemplatePreviewTab] = useState<'codigo' | 'preview'>('codigo');
  const [templatePreviewHtml, setTemplatePreviewHtml] = useState<string | null>(null);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const [desks, setDesks] = useState<{ id: string; nombre: string; activo: boolean }[]>([]);
  const [scrumDeskId, setScrumDeskId] = useState<string>('');
  const [scrumSaving, setScrumSaving] = useState(false);

  const [meetingsDeskIds, setMeetingsDeskIds] = useState<Set<string>>(new Set());
  const [meetingsRoles, setMeetingsRoles] = useState({
    meetings_admin: true,
    meetings_ops: true,
    meetings_equipo: false,
  });
  const [meetingsSaving, setMeetingsSaving] = useState(false);

  const [notifSoundEnabled, setNotifSoundEnabled] = useState(true);
  const [notifSoundType, setNotifSoundType] = useState<SoundType>('chime');
  const [notifSaving, setNotifSaving] = useState(false);

  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatSaving, setChatSaving] = useState(false);

  const [driveEnabled, setDriveEnabled] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);
  const [geminiEnabled, setGeminiEnabled] = useState(false);
  const [geminiSaving, setGeminiSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [taskData, delData, settings, templates, desksData] = await Promise.all([
        api.getTaskTypes(),
        api.getDeliverableTypes(),
        api.getSiteSettings().catch(() => ({})),
        api.getEmailTemplates().catch(() => []),
        api.getDesks().catch(() => []),
      ]);
      if (Array.isArray(taskData)) setTaskTypes(taskData);
      if (Array.isArray(delData)) setDeliverableTypes(delData);
      if (settings && typeof settings === 'object') {
        setSiteSettings(settings);
        setAppearanceForm({
          logo_url: settings.logo_url ?? '',
          logo_email_url: settings.logo_email_url ?? '',
          favicon_url: settings.favicon_url ?? '',
          site_name: settings.site_name ?? 'TIUSDEI',
          email_from_name: settings.email_from_name ?? 'TIUSDEI',
          email_footer_text: settings.email_footer_text ?? 'TIUSDEI Portal · Notificación automática',
        });
        setRegistrationForm({
          registration_enabled: settings.registration_enabled === 'true',
          registration_allowed_domains: settings.registration_allowed_domains ?? 'qbit.com.ec',
          registration_max_users: parseInt(settings.registration_max_users ?? '0', 10) || 0,
        });
        const rolesStr = settings.can_delete_tasks_roles ?? 'admin,ops';
        const roles = rolesStr.split(',').map((r) => r.trim()).filter(Boolean);
        setPermissionsForm({
          can_delete_admin: roles.includes('admin'),
          can_delete_ops: roles.includes('ops'),
          can_delete_equipo: roles.includes('equipo'),
        });
      }
      if (Array.isArray(templates)) setEmailTemplates(templates);
      if (Array.isArray(desksData)) setDesks(desksData);
      if (settings && typeof settings === 'object') {
        setScrumDeskId(settings.scrum_desk_id ?? '');
        // Parse daily meetings settings
        const deskIdsStr = settings.daily_meetings_desk_ids ?? '';
        setMeetingsDeskIds(new Set(deskIdsStr.split(',').map((s: string) => s.trim()).filter(Boolean)));
        const meetRolesStr = settings.daily_meetings_roles ?? 'admin,ops';
        const meetRoles = meetRolesStr.split(',').map((r: string) => r.trim()).filter(Boolean);
        setMeetingsRoles({
          meetings_admin: meetRoles.includes('admin'),
          meetings_ops: meetRoles.includes('ops'),
          meetings_equipo: meetRoles.includes('equipo'),
        });
        // Notification sound settings
        setNotifSoundEnabled(settings.notification_sound_enabled !== 'false');
        const st = settings.notification_sound_type;
        if (st && SOUND_TYPES.includes(st as SoundType)) setNotifSoundType(st as SoundType);
        // Chat setting
        setChatEnabled(settings.chat_enabled === 'true');
        // Drive + Gemini settings
        setDriveEnabled(settings.drive_enabled === 'true');
        setGeminiEnabled(settings.gemini_enabled === 'true');
      }
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (type: 'task' | 'deliverable') => {
    setSaving(true);
    try {
      if (selectedItem) {
        const fn = type === 'task' ? api.patchTaskType : api.patchDeliverableType;
        const result: any = await fn(selectedItem.item.id, formData);
        if (result?.error) throw new Error(result.error);
        toast.success('Tipo actualizado');
      } else {
        const fn = type === 'task' ? api.createTaskType : api.createDeliverableType;
        const result: any = await fn({ nombre: formData.nombre });
        if (result?.error) throw new Error(result.error);
        toast.success('Tipo creado');
      }

      type === 'task' ? setTaskDialogOpen(false) : setDelDialogOpen(false);
      setFormData({ nombre: '', activo: true });
      setSelectedItem(null);
      fetchData();
    } catch (error: any) {
      toast.error('Error', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (type: 'task' | 'deliverable', item: ItemType) => {
    setSelectedItem({ type, item });
    setFormData({ nombre: item.nombre, activo: item.activo });
    type === 'task' ? setTaskDialogOpen(true) : setDelDialogOpen(true);
  };

  const handleDelete = async (type: 'task' | 'deliverable', item: ItemType) => {
    const label = type === 'task' ? 'tipo de tarea' : 'tipo de entregable';
    if (!window.confirm(`¿Eliminar el ${label} "${item.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      const fn = type === 'task' ? api.deleteTaskType : api.deleteDeliverableType;
      const result: { error?: string } = await fn(item.id);
      if (result?.error) throw new Error(result.error);
      toast.success('Tipo eliminado');
      fetchData();
    } catch (error: unknown) {
      toast.error('Error', { description: error instanceof Error ? error.message : 'No se pudo eliminar' });
    }
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    setPermissionsSaving(true);
    try {
      const roles: string[] = [];
      if (permissionsForm.can_delete_admin) roles.push('admin');
      if (permissionsForm.can_delete_ops) roles.push('ops');
      if (permissionsForm.can_delete_equipo) roles.push('equipo');
      const rolesStr = roles.length > 0 ? roles.join(',') : 'admin';
      await api.patchSiteSettings({ can_delete_tasks_roles: rolesStr });
      toast.success('Permisos guardados');
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setPermissionsSaving(false);
    }
  };

  const handleSaveRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistrationSaving(true);
    try {
      const result = await api.patchRegistrationSettings({
        registration_enabled: registrationForm.registration_enabled,
        registration_allowed_domains: registrationForm.registration_allowed_domains.trim(),
        registration_max_users: registrationForm.registration_max_users,
      });
      if (result?.error) throw new Error(result.error);
      toast.success('Configuración de registro guardada');
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setRegistrationSaving(false);
    }
  };

  const handleSaveAppearance = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppearanceSaving(true);
    try {
      const result = await api.patchSiteSettings({
        logo_url: appearanceForm.logo_url || null,
        logo_email_url: appearanceForm.logo_email_url || null,
        favicon_url: appearanceForm.favicon_url || null,
        site_name: appearanceForm.site_name,
        email_from_name: appearanceForm.email_from_name,
        email_footer_text: appearanceForm.email_footer_text,
      });
      if (result?.error) throw new Error(result.error);
      toast.success('Apariencia guardada');
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setAppearanceSaving(false);
    }
  };

  const openTemplateEdit = (t: EmailTemplate) => {
    setSelectedTemplate(t);
    setTemplateForm({
      subject_template: t.subject_template || '',
      html_template: t.html_template ?? '',
    });
    setTemplatePreviewTab('codigo');
    setTemplatePreviewHtml(null);
    setTemplateEditOpen(true);
  };

  const handleLoadDefaultTemplate = async () => {
    if (!selectedTemplate) return;
    setTemplatePreviewLoading(true);
    try {
      const res = await api.getEmailTemplatePreview(selectedTemplate.type, null);
      setTemplateForm((prev) => ({ ...prev, html_template: res.html }));
      toast.success('Plantilla por defecto cargada. Edita el texto según necesites.');
    } catch {
      toast.error('Error al cargar plantilla por defecto');
    } finally {
      setTemplatePreviewLoading(false);
    }
  };

  const handleUpdatePreview = async () => {
    if (!selectedTemplate) return;
    setTemplatePreviewLoading(true);
    try {
      const res = await api.getEmailTemplatePreview(selectedTemplate.type, templateForm.html_template || null);
      setTemplatePreviewHtml(res.html);
      setTemplatePreviewTab('preview');
    } catch {
      toast.error('Error al generar vista previa');
    } finally {
      setTemplatePreviewLoading(false);
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaviconUploading(true);
    try {
      const result = await api.uploadFavicon(file);
      if (result?.error) throw new Error(result.error);
      setAppearanceForm((prev) => ({ ...prev, favicon_url: result.favicon_url || '' }));
      await api.patchSiteSettings({ favicon_url: result.favicon_url || null });
      toast.success('Favicon subido');
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo subir' });
    } finally {
      setFaviconUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    setTemplateSaving(true);
    try {
      const result = await api.patchEmailTemplate(selectedTemplate.type, {
        subject_template: templateForm.subject_template,
        html_template: templateForm.html_template || null,
      });
      if (result?.error) throw new Error(result.error);
      toast.success('Plantilla guardada');
      setTemplateEditOpen(false);
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleSaveScrum = async (e: React.FormEvent) => {
    e.preventDefault();
    setScrumSaving(true);
    try {
      await api.patchSiteSettings({ scrum_desk_id: scrumDeskId || null });
      toast.success('Configuración de Scrum guardada');
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setScrumSaving(false);
    }
  };

  const handleSaveMeetings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMeetingsSaving(true);
    try {
      const deskIdsStr = Array.from(meetingsDeskIds).join(',');
      const roles: string[] = [];
      if (meetingsRoles.meetings_admin) roles.push('admin');
      if (meetingsRoles.meetings_ops) roles.push('ops');
      if (meetingsRoles.meetings_equipo) roles.push('equipo');
      await api.patchSiteSettings({
        daily_meetings_desk_ids: deskIdsStr,
        daily_meetings_roles: roles.join(','),
      });
      toast.success('Configuración de reuniones guardada');
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setMeetingsSaving(false);
    }
  };

  const handleSaveNotifSound = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotifSaving(true);
    try {
      await api.patchSiteSettings({
        notification_sound_enabled: String(notifSoundEnabled),
        notification_sound_type: notifSoundType,
      } as any);
      toast.success('Configuración de sonido guardada');
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setNotifSaving(false);
    }
  };

  const handleSaveChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setChatSaving(true);
    try {
      await api.patchSiteSettings({ chat_enabled: String(chatEnabled) } as any);
      toast.success('Configuración de chat guardada');
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setChatSaving(false);
    }
  };

  const handleSaveDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriveSaving(true);
    try {
      await api.patchSiteSettings({ drive_enabled: String(driveEnabled) } as any);
      toast.success('Configuración de Drive guardada');
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setDriveSaving(false);
    }
  };

  const handleSaveGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiSaving(true);
    try {
      await api.patchSiteSettings({ gemini_enabled: String(geminiEnabled) } as any);
      toast.success('Configuración de Gemini guardada');
      fetchData();
    } catch (err: unknown) {
      toast.error('Error', { description: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setGeminiSaving(false);
    }
  };

  const closeTypeDialog = () => {
    setFormData({ nombre: '', activo: true });
    setSelectedItem(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in min-w-0 overflow-x-hidden">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Configuración</h2>
        <p className="text-sm text-muted-foreground">Gestiona tipos, apariencia y correos</p>
      </div>

      <Tabs defaultValue="tipos" className="w-full">
        <div className="overflow-x-auto -mx-1">
          <TabsList className="grid w-full min-w-max grid-cols-11 max-w-5xl">
            <TabsTrigger value="tipos" className="text-xs sm:text-sm">Tipos</TabsTrigger>
            <TabsTrigger value="apariencia" className="text-xs sm:text-sm">Apariencia</TabsTrigger>
            <TabsTrigger value="permisos" className="text-xs sm:text-sm">Permisos</TabsTrigger>
            <TabsTrigger value="registro" className="text-xs sm:text-sm">Registro</TabsTrigger>
            <TabsTrigger value="correos" className="text-xs sm:text-sm">Correos</TabsTrigger>
            <TabsTrigger value="scrum" className="text-xs sm:text-sm">Scrum</TabsTrigger>
            <TabsTrigger value="reuniones" className="text-xs sm:text-sm">Reuniones</TabsTrigger>
            <TabsTrigger value="notificaciones" className="text-xs sm:text-sm">Sonido</TabsTrigger>
            <TabsTrigger value="chat" className="text-xs sm:text-sm">Chat</TabsTrigger>
            <TabsTrigger value="drive" className="text-xs sm:text-sm">Drive</TabsTrigger>
            <TabsTrigger value="gemini" className="text-xs sm:text-sm">Gemini</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tipos" className="mt-4">
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
        {/* Task Types */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <CheckSquare className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span className="truncate">Tipos de Tarea</span>
            </CardTitle>
            <TypeDialogComponent
                type="task"
                open={taskDialogOpen}
                onOpenChange={setTaskDialogOpen}
                onClose={closeTypeDialog}
                formData={formData}
                setFormData={setFormData}
                selectedItem={selectedItem}
                saving={saving}
                onSubmit={handleSubmit}
              />
          </CardHeader>
          <CardContent>
            {taskTypes.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground">No hay tipos</p>
            ) : (
              <div className="space-y-2">
                {taskTypes.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors gap-2"
                  >
                    <span className="font-medium text-sm truncate">{item.nombre}</span>
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <Badge variant={item.activo ? "default" : "secondary"} className="text-[10px] sm:text-xs">
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => openEditDialog('task', item)}
                      >
                        <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete('task', item)}
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deliverable Types */}
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <FileBox className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span className="truncate">Tipos de Entregable</span>
            </CardTitle>
            <TypeDialogComponent
                type="deliverable"
                open={delDialogOpen}
                onOpenChange={setDelDialogOpen}
                onClose={closeTypeDialog}
                formData={formData}
                setFormData={setFormData}
                selectedItem={selectedItem}
                saving={saving}
                onSubmit={handleSubmit}
              />
          </CardHeader>
          <CardContent>
            {deliverableTypes.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground text-sm">No hay tipos</p>
            ) : (
              <div className="space-y-2">
                {deliverableTypes.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors gap-2"
                  >
                    <span className="font-medium text-sm truncate">{item.nombre}</span>
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <Badge variant={item.activo ? "default" : "secondary"} className="text-[10px] sm:text-xs">
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8"
                        onClick={() => openEditDialog('deliverable', item)}
                      >
                        <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete('deliverable', item)}
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        <TabsContent value="apariencia" className="mt-4">
          <Card className="glass-card max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5 text-primary" />
                Logo y apariencia
              </CardTitle>
              <p className="text-sm text-muted-foreground">Logo web, logo en correos y nombre del sitio</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveAppearance} className="space-y-4">
                <div className="space-y-2">
                  <Label>URL Logo (web)</Label>
                  <Input
                    type="url"
                    placeholder="https://ejemplo.com/logo.png"
                    value={appearanceForm.logo_url}
                    onChange={(e) => setAppearanceForm({ ...appearanceForm, logo_url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">URL de la imagen del logo para el sidebar y login</p>
                </div>
                <div className="space-y-2">
                  <Label>URL Logo (correos)</Label>
                  <Input
                    type="url"
                    placeholder="https://ejemplo.com/logo-email.png"
                    value={appearanceForm.logo_email_url}
                    onChange={(e) => setAppearanceForm({ ...appearanceForm, logo_email_url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">URL del logo que aparece en los emails (debe ser pública)</p>
                </div>
                <div className="space-y-2">
                  <Label>Favicon</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="url"
                      placeholder="https://ejemplo.com/favicon.ico"
                      value={appearanceForm.favicon_url}
                      onChange={(e) => setAppearanceForm({ ...appearanceForm, favicon_url: e.target.value })}
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        ref={faviconInputRef}
                        type="file"
                        accept=".ico,.png,.svg,.gif,.webp"
                        className="hidden"
                        onChange={handleFaviconUpload}
                        disabled={faviconUploading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => faviconInputRef.current?.click()}
                        disabled={faviconUploading}
                      >
                        {faviconUploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                        Subir
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">URL del favicon o súbelo (ico, png, svg, gif, webp - máx 2MB)</p>
                  {appearanceForm.favicon_url && (
                    <div className="flex items-center gap-2 mt-1">
                      <img src={appearanceForm.favicon_url} alt="Favicon" className="h-6 w-6 object-contain" />
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">{appearanceForm.favicon_url}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Nombre del sitio / Título de la pestaña</Label>
                  <Input
                    placeholder="TIUSDEI"
                    value={appearanceForm.site_name}
                    onChange={(e) => setAppearanceForm({ ...appearanceForm, site_name: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Nombre que aparece en el header, login y en la pestaña del navegador</p>
                </div>
                <div className="space-y-2">
                  <Label>Nombre remitente (emails)</Label>
                  <Input
                    placeholder="TIUSDEI"
                    value={appearanceForm.email_from_name}
                    onChange={(e) => setAppearanceForm({ ...appearanceForm, email_from_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pie de página (emails)</Label>
                  <Input
                    placeholder="TIUSDEI Portal · Notificación automática"
                    value={appearanceForm.email_footer_text}
                    onChange={(e) => setAppearanceForm({ ...appearanceForm, email_footer_text: e.target.value })}
                  />
                </div>
                <Button type="submit" disabled={appearanceSaving}>
                  {appearanceSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Guardar apariencia
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permisos" className="mt-4">
          <Card className="glass-card max-w-2xl w-full min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Permisos de tareas</CardTitle>
              <p className="text-sm text-muted-foreground">Define quién puede borrar tareas desde la vista de Tareas.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSavePermissions} className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-base">Quién puede borrar tareas</Label>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <span className="font-medium">Admin</span>
                      <Switch
                        checked={permissionsForm.can_delete_admin}
                        onCheckedChange={(v) => setPermissionsForm({ ...permissionsForm, can_delete_admin: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <span className="font-medium">OPS</span>
                      <Switch
                        checked={permissionsForm.can_delete_ops}
                        onCheckedChange={(v) => setPermissionsForm({ ...permissionsForm, can_delete_ops: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <span className="font-medium">Equipo</span>
                      <Switch
                        checked={permissionsForm.can_delete_equipo}
                        onCheckedChange={(v) => setPermissionsForm({ ...permissionsForm, can_delete_equipo: v })}
                      />
                    </div>
                  </div>
                </div>
                <Button type="submit" disabled={permissionsSaving}>
                  {permissionsSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Guardar permisos
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registro" className="mt-4">
          <Card className="glass-card max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Control de registro de usuarios
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configura quién puede crear cuentas. Restringe por dominio de email y límite de usuarios.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveRegistration} className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Label className="text-base">Habilitar registro público</Label>
                    <p className="text-sm text-muted-foreground">
                      Si está desactivado, nadie puede registrarse desde la página de login.
                    </p>
                  </div>
                  <Switch
                    checked={registrationForm.registration_enabled}
                    onCheckedChange={(v) => setRegistrationForm({ ...registrationForm, registration_enabled: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-domains">Dominios de email permitidos</Label>
                  <Input
                    id="reg-domains"
                    placeholder="qbit.com.ec, otro.com"
                    value={registrationForm.registration_allowed_domains}
                    onChange={(e) => setRegistrationForm({ ...registrationForm, registration_allowed_domains: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Separados por coma. Ej: qbit.com.ec. Solo emails con estos dominios podrán registrarse. Vacío = cualquier dominio.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-max">Límite máximo de usuarios</Label>
                  <Input
                    id="reg-max"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={registrationForm.registration_max_users || ''}
                    onChange={(e) => setRegistrationForm({
                      ...registrationForm,
                      registration_max_users: parseInt(e.target.value || '0', 10) || 0,
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = sin límite. Cuando se alcance este número, no se podrán crear más cuentas.
                  </p>
                </div>
                <Button type="submit" disabled={registrationSaving}>
                  {registrationSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Guardar configuración de registro
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="correos" className="mt-4">
          <Card className="glass-card max-w-3xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Plantillas de correo
              </CardTitle>
              <p className="text-sm text-muted-foreground">Edita asunto y contenido HTML de cada plantilla</p>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">
                Variables: {'{{taskTitle}}'}, {'{{recipientName}}'}, {'{{brandName}}'}, {'{{fechaEntrega}}'}, etc.
              </p>
              <div className="space-y-2">
                {emailTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted gap-2"
                  >
                    <div>
                      <span className="font-medium text-sm">{TEMPLATE_LABELS[t.type] || t.type}</span>
                      <p className="text-xs text-muted-foreground truncate max-w-md">{t.subject_template}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openTemplateEdit(t)}>
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Dialog open={templateEditOpen} onOpenChange={(o) => { setTemplateEditOpen(o); if (!o) setTemplatePreviewTab('codigo'); setTemplatePreviewHtml(null); }}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" aria-describedby="config-template-desc">
              <DialogHeader>
                <DialogTitle>Editar plantilla: {selectedTemplate ? TEMPLATE_LABELS[selectedTemplate.type] || selectedTemplate.type : ''}</DialogTitle>
                <DialogDescription id="config-template-desc" className="sr-only">
                  Edita el asunto y el contenido HTML del correo. Usa pestañas para ver el código o la vista previa visual.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveTemplate} className="flex flex-col flex-1 min-h-0 space-y-4">
                <div className="space-y-2">
                  <Label>Asunto</Label>
                  <Input
                    value={templateForm.subject_template}
                    onChange={(e) => setTemplateForm({ ...templateForm, subject_template: e.target.value })}
                    placeholder="Ej: Nueva Tarea Asignada: {{taskTitle}}"
                    required
                  />
                </div>
                <Tabs value={templatePreviewTab} onValueChange={(v) => setTemplatePreviewTab(v as 'codigo' | 'preview')} className="flex-1 min-h-0 flex flex-col">
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="codigo">Código HTML</TabsTrigger>
                    <TabsTrigger value="preview">Vista previa (correo final)</TabsTrigger>
                  </TabsList>
                  <TabsContent value="codigo" className="mt-2 flex-1 min-h-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Contenido HTML</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLoadDefaultTemplate}
                        disabled={templatePreviewLoading || !selectedTemplate}
                      >
                        {templatePreviewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        Cargar plantilla por defecto
                      </Button>
                    </div>
                    <Textarea
                      value={templateForm.html_template}
                      onChange={(e) => setTemplateForm({ ...templateForm, html_template: e.target.value })}
                      placeholder="HTML personalizado. Vacío = usar plantilla por defecto. Usa {{taskTitle}}, {{recipientName}}, etc."
                      rows={14}
                      className="font-mono text-xs resize-none"
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={handleUpdatePreview} disabled={templatePreviewLoading}>
                      {templatePreviewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Ver vista previa
                    </Button>
                  </TabsContent>
                  <TabsContent value="preview" className="mt-2 flex-1 min-h-0">
                    <div className="border rounded-lg bg-muted/30 overflow-hidden" style={{ minHeight: 400 }}>
                      {templatePreviewHtml ? (
                        <iframe
                          title="Vista previa del correo"
                          srcDoc={templatePreviewHtml}
                          className="w-full h-[500px] border-0"
                          sandbox="allow-same-origin"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground text-sm gap-2">
                          <p>Haz clic en &quot;Ver vista previa&quot; para ver el correo como quedará.</p>
                          <Button type="button" variant="outline" size="sm" onClick={handleUpdatePreview} disabled={templatePreviewLoading}>
                            {templatePreviewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                            Generar vista previa
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Vista previa con datos de ejemplo. Los correos reales usarán los datos de cada tarea.</p>
                  </TabsContent>
                </Tabs>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setTemplateEditOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={templateSaving}>
                    {templateSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Guardar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="scrum" className="mt-4">
          <Card className="glass-card max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-primary" />
                Configuración de Scrum
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Define qué mesa de trabajo se usa como filtro en la zona Scrum.
                Solo las tareas asignadas a esta mesa aparecerán en el tablero Scrum.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveScrum} className="space-y-4">
                <div className="space-y-2">
                  <Label>Mesa de trabajo para Scrum</Label>
                  <Select value={scrumDeskId || '__none__'} onValueChange={(v) => setScrumDeskId(v === '__none__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar mesa..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Todas las mesas (sin filtro)</SelectItem>
                      {desks.filter((d) => d.activo).map((desk) => (
                        <SelectItem key={desk.id} value={desk.id}>{desk.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Si seleccionas una mesa, el tablero Scrum solo mostrará las tareas de esa mesa.
                    Si seleccionas &quot;Todas las mesas&quot;, se mostrarán todas las tareas del sprint.
                  </p>
                </div>
                <Button type="submit" disabled={scrumSaving}>
                  {scrumSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Guardar configuración Scrum
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reuniones" className="mt-4">
          <Card className="glass-card max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-purple-500" />
                Reuniones en Daily Mesas
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configura en qué mesas se muestran las horas de reuniones y qué roles pueden verlas.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveMeetings} className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-base">Mesas con reuniones visibles</Label>
                  <p className="text-xs text-muted-foreground">
                    Si no seleccionas ninguna, las reuniones no se mostrarán en ninguna mesa.
                  </p>
                  <div className="flex flex-col gap-3">
                    {desks.filter(d => d.activo).map(desk => (
                      <div key={desk.id} className="flex items-center justify-between rounded-lg border p-4">
                        <span className="font-medium">{desk.nombre}</span>
                        <Switch
                          checked={meetingsDeskIds.has(desk.id)}
                          onCheckedChange={(v) => {
                            setMeetingsDeskIds(prev => {
                              const next = new Set(prev);
                              v ? next.add(desk.id) : next.delete(desk.id);
                              return next;
                            });
                          }}
                        />
                      </div>
                    ))}
                    {desks.filter(d => d.activo).length === 0 && (
                      <p className="text-sm text-muted-foreground italic">No hay mesas activas configuradas.</p>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-base">Roles que pueden ver reuniones</Label>
                  <p className="text-xs text-muted-foreground">
                    Solo los usuarios con estos roles verán las horas de reuniones en la Daily de Mesas.
                  </p>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <span className="font-medium">Admin</span>
                      <Switch
                        checked={meetingsRoles.meetings_admin}
                        onCheckedChange={(v) => setMeetingsRoles({ ...meetingsRoles, meetings_admin: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <span className="font-medium">OPS</span>
                      <Switch
                        checked={meetingsRoles.meetings_ops}
                        onCheckedChange={(v) => setMeetingsRoles({ ...meetingsRoles, meetings_ops: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <span className="font-medium">Equipo</span>
                      <Switch
                        checked={meetingsRoles.meetings_equipo}
                        onCheckedChange={(v) => setMeetingsRoles({ ...meetingsRoles, meetings_equipo: v })}
                      />
                    </div>
                  </div>
                </div>
                <Button type="submit" disabled={meetingsSaving}>
                  {meetingsSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Guardar configuración de reuniones
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <Card className="glass-card max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                Chat de Mesas
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Activa o desactiva el chat interno por mesas de trabajo. Los miembros de cada mesa son gestionados desde la sección de Mesas.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveChat} className="space-y-6">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <MessageCircle className={cn('h-5 w-5', chatEnabled ? 'text-primary' : 'text-muted-foreground')} />
                    <div>
                      <p className="font-medium">Chat habilitado</p>
                      <p className="text-xs text-muted-foreground">
                        {chatEnabled
                          ? 'Los usuarios verán el botón de chat flotante en la esquina inferior derecha y podrán conversar en las mesas a las que pertenecen'
                          : 'El chat está oculto para todos los usuarios'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={chatEnabled}
                    onCheckedChange={setChatEnabled}
                  />
                </div>
                <div className="rounded-lg border p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    <strong>Nota:</strong> Los miembros de cada mesa se gestionan desde{' '}
                    <a href="/admin/mesas" className="text-primary underline">Administración &rarr; Mesas</a>.
                    Solo los miembros de una mesa pueden ver y enviar mensajes en su chat. Los admin y ops pueden ver todos los chats.
                  </p>
                </div>
                <Button type="submit" disabled={chatSaving}>
                  {chatSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Guardar configuración de chat
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drive" className="mt-4">
          <Card className="glass-card max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-blue-500" />
                Google Drive
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Permite a los usuarios navegar su Google Drive y adjuntar archivos a las tareas.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveDrive} className="space-y-6">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <FolderOpen className={cn('h-5 w-5', driveEnabled ? 'text-blue-500' : 'text-muted-foreground')} />
                    <div>
                      <p className="font-medium">Google Drive habilitado</p>
                      <p className="text-xs text-muted-foreground">
                        {driveEnabled
                          ? 'Los usuarios pueden explorar su Drive y adjuntar archivos a tareas'
                          : 'La integración de Google Drive está desactivada'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={driveEnabled}
                    onCheckedChange={setDriveEnabled}
                  />
                </div>
                <div className="rounded-lg border p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    <strong>Requisito:</strong> Los usuarios deben tener su cuenta de Google conectada
                    y haber otorgado permiso de acceso a Drive durante la autenticación.
                    Si un usuario ya se autenticó sin el permiso de Drive, deberá reconectar su cuenta desde su perfil.
                  </p>
                </div>
                <Button type="submit" disabled={driveSaving}>
                  {driveSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Guardar configuración de Drive
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gemini" className="mt-4">
          <Card className="glass-card max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Gemini AI
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Asistente de inteligencia artificial integrado con contexto de tareas y proyectos.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveGemini} className="space-y-6">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className={cn('h-5 w-5', geminiEnabled ? 'text-purple-500' : 'text-muted-foreground')} />
                    <div>
                      <p className="font-medium">Gemini AI habilitado</p>
                      <p className="text-xs text-muted-foreground">
                        {geminiEnabled
                          ? 'Los usuarios verán el botón de Gemini y podrán interactuar con el asistente AI'
                          : 'El asistente Gemini está oculto para todos los usuarios'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={geminiEnabled}
                    onCheckedChange={setGeminiEnabled}
                  />
                </div>
                <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <strong>Funcionalidades:</strong>
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Chat conversacional con contexto de tus tareas y proyectos</li>
                    <li>Resúmenes automáticos de tareas, comentarios y sprints</li>
                    <li>Historial de conversaciones por usuario</li>
                  </ul>
                </div>
                <div className="rounded-lg border p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    <strong>Nota:</strong> Gemini AI utiliza la API de Google Gemini.
                    La clave API se configura en el servidor. Contacta al administrador del sistema si necesitas actualizar la clave.
                  </p>
                </div>
                <Button type="submit" disabled={geminiSaving}>
                  {geminiSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Guardar configuración de Gemini
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificaciones" className="mt-4">
          <Card className="glass-card max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Sonido de Notificaciones
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configura el sonido que se reproduce cuando llega una notificación en tiempo real.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveNotifSound} className="space-y-6">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    {notifSoundEnabled ? (
                      <Volume2 className="h-5 w-5 text-primary" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">Sonido activado</p>
                      <p className="text-xs text-muted-foreground">
                        {notifSoundEnabled ? 'Se reproducirá un sonido con cada notificación' : 'Las notificaciones llegarán en silencio'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notifSoundEnabled}
                    onCheckedChange={setNotifSoundEnabled}
                  />
                </div>

                {notifSoundEnabled && (
                  <div className="space-y-3">
                    <Label className="text-base">Tipo de sonido</Label>
                    <div className="flex flex-col gap-2">
                      {SOUND_TYPES.map((st) => (
                        <div
                          key={st}
                          className={`flex items-center justify-between rounded-lg border p-4 cursor-pointer transition-colors ${
                            notifSoundType === st ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => setNotifSoundType(st)}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="sound_type"
                              checked={notifSoundType === st}
                              onChange={() => setNotifSoundType(st)}
                              className="accent-primary"
                            />
                            <span className="font-medium text-sm">{SOUND_LABELS[st]}</span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              playNotificationSound(st);
                            }}
                          >
                            <Volume2 className="h-4 w-4 mr-1" />
                            Probar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button type="submit" disabled={notifSaving}>
                  {notifSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Guardar configuración de sonido
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
