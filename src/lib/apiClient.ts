/**
 * API client para TIUSDEI (MySQL backend).
 * Única fuente de verdad para URL base, token y requests.
 *
 * Seguridad del token: se guarda en localStorage (tiusdei_token). Esto es vulnerable
 * a XSS: si un script malicioso se ejecuta en la página puede leer el token. Mitigaciones:
 * sanitizar entradas, CSP, y en el futuro valorar httpOnly cookies con el backend.
 */

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003');

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tiusdei_token');
}

export interface ApiRequestOptions extends RequestInit {
  signal?: AbortSignal;
}

/** Request autenticado; opcionalmente cancelable con AbortController. */
export async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const { signal, ...rest } = options;
  return fetch(`${API_URL}${path}`, { ...rest, headers, signal });
}

async function request(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  return apiRequest(path, options);
}

// Auth
export async function login(email: string, password: string) {
  const res = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  return res.json();
}

export async function register(email: string, password: string, nombre: string, rol = 'equipo') {
  const res = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, nombre, rol }) });
  return res.json();
}

export async function getMe() {
  const res = await request('/api/auth/me');
  return res.json();
}

export async function updateMyProfile(nombre: string) {
  const res = await request('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({ nombre }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Error al actualizar');
  return res.json();
}

export async function uploadAvatar(file: File) {
  const token = getToken();
  const formData = new FormData();
  formData.append('avatar', file);
  const res = await fetch(`${API_URL}/api/auth/me/avatar`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Error al subir avatar');
  return res.json();
}

export async function deleteAvatar() {
  const res = await request('/api/auth/me/avatar', { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json()).error || 'Error al eliminar avatar');
  return res.json();
}

export async function changePassword(current_password: string | undefined, new_password: string) {
  const body: Record<string, string> = { new_password };
  if (current_password) body.current_password = current_password;
  const res = await request('/api/auth/me/change-password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al cambiar contraseña');
  return data;
}

// Data API
export async function getProfiles(deskId?: string) {
  const url = deskId ? `/api/data/profiles?desk_id=${encodeURIComponent(deskId)}` : '/api/data/profiles';
  const res = await request(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDeskMembers(deskId: string) {
  const res = await request(`/api/data/desks/${deskId}/members`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addDeskMember(deskId: string, userId: string) {
  const res = await request(`/api/data/desks/${deskId}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
  return res.json();
}

export async function addDeskMembers(deskId: string, userIds: string[]) {
  const res = await request(`/api/data/desks/${deskId}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  });
  return res.json();
}

export async function removeDeskMember(deskId: string, userId: string) {
  const res = await request(`/api/data/desks/${deskId}/members/${userId}`, { method: 'DELETE' });
  return res.json();
}

export async function getDeskBrands(deskId: string) {
  const res = await request(`/api/data/desks/${deskId}/brands`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addDeskBrands(deskId: string, brandIds: string[]) {
  const res = await request(`/api/data/desks/${deskId}/brands`, {
    method: 'POST',
    body: JSON.stringify({ brand_ids: brandIds }),
  });
  return res.json();
}

export async function removeDeskBrand(deskId: string, brandId: string) {
  const res = await request(`/api/data/desks/${deskId}/brands/${brandId}`, { method: 'DELETE' });
  return res.json();
}

export async function patchProfile(id: string, data: { nombre: string; rol: string; activo: boolean }) {
  const res = await request(`/api/data/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function getClients() {
  const res = await request('/api/data/clients');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createClient(data: { nombre: string; email_contacto?: string; activo?: boolean }) {
  const res = await request('/api/data/clients', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchClient(id: string, data: { nombre?: string; email_contacto?: string; activo?: boolean }) {
  const res = await request(`/api/data/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteClient(id: string) {
  const res = await request(`/api/data/clients/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function getBrands(deskId?: string) {
  const url = deskId ? `/api/data/brands?desk_id=${encodeURIComponent(deskId)}` : '/api/data/brands';
  const res = await request(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createBrand(data: { nombre: string; cliente_id?: string; activo?: boolean }) {
  const res = await request('/api/data/brands', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchBrand(id: string, data: { nombre?: string; cliente_id?: string; activo?: boolean }) {
  const res = await request(`/api/data/brands/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteBrand(id: string) {
  const res = await request(`/api/data/brands/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function getDesks() {
  const res = await request('/api/data/desks');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createDesk(data: { nombre: string; activo?: boolean }) {
  const res = await request('/api/data/desks', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchDesk(id: string, data: { nombre?: string; activo?: boolean }) {
  const res = await request(`/api/data/desks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function getTaskTypes() {
  const res = await request('/api/data/task-types');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createTaskType(data: { nombre: string }) {
  const res = await request('/api/data/task-types', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchTaskType(id: string, data: { nombre?: string; activo?: boolean }) {
  const res = await request(`/api/data/task-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteTaskType(id: string) {
  const res = await request(`/api/data/task-types/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function getDeliverableTypes() {
  const res = await request('/api/data/deliverable-types');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createDeliverableType(data: { nombre: string }) {
  const res = await request('/api/data/deliverable-types', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchDeliverableType(id: string, data: { nombre?: string; activo?: boolean }) {
  const res = await request(`/api/data/deliverable-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteDeliverableType(id: string) {
  const res = await request(`/api/data/deliverable-types/${id}`, { method: 'DELETE' });
  return res.json();
}

export interface GetTasksOptions {
  limit?: number;
  offset?: number;
  sprint_id?: string;
  backlog?: boolean;
  desk_id?: string;
  responsable_user_id?: string;
  brand_id?: string;
  estado?: string;
  prioridad?: string;
  search?: string;
}

export async function getTask(id: string): Promise<unknown> {
  const res = await request(`/api/data/tasks/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTasks(options?: GetTasksOptions): Promise<{ tasks: unknown[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.sprint_id) params.set('sprint_id', options.sprint_id);
  if (options?.backlog) params.set('backlog', '1');
  if (options?.desk_id) params.set('desk_id', options.desk_id);
  if (options?.responsable_user_id && options.responsable_user_id !== 'all') params.set('responsable_user_id', options.responsable_user_id);
  if (options?.brand_id && options.brand_id !== 'all') params.set('brand_id', options.brand_id);
  if (options?.estado && options.estado !== 'all') params.set('estado', options.estado);
  if (options?.prioridad && options.prioridad !== 'all') params.set('prioridad', options.prioridad);
  if (options?.search) params.set('search', options.search);
  const qs = params.toString();
  const res = await request(`/api/data/tasks${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createTask(data: Record<string, unknown>) {
  const res = await request('/api/data/tasks', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchTask(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteTask(id: string) {
  const res = await request('/api/data/tasks/bulk-delete', { method: 'POST', body: JSON.stringify({ task_ids: [id] }) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || 'Error al eliminar');
  }
  return res.json();
}

// ========== Task Reads ==========
export async function markTaskRead(taskId: string) {
  const res = await request(`/api/data/tasks/${taskId}/read`, { method: 'POST' });
  return res.json();
}

export async function getTaskReads(taskId: string): Promise<{ user_id: string; read_at: string; nombre: string; avatar_url: string | null }[]> {
  const res = await request(`/api/data/tasks/${taskId}/reads`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Features (Scrum) ==========
export async function getFeatures(brandId?: string): Promise<unknown[]> {
  const url = brandId ? `/api/data/features?brand_id=${encodeURIComponent(brandId)}` : '/api/data/features';
  const res = await request(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createFeature(data: { name: string; description?: string; brand_id?: string; status?: 'backlog' | 'en_progreso' | 'completado' }) {
  const res = await request('/api/data/features', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchFeature(id: string, data: { name?: string; description?: string; status?: 'backlog' | 'en_progreso' | 'completado'; brand_id?: string }) {
  const res = await request(`/api/data/features/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

// ========== Sprints (Scrum) ==========
export async function getSprints(brandId?: string): Promise<unknown[]> {
  const url = brandId ? `/api/data/sprints?brand_id=${encodeURIComponent(brandId)}` : '/api/data/sprints';
  const res = await request(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createSprint(data: {
  name: string;
  goal?: string;
  start_date: string;
  end_date: string;
  status?: 'planned' | 'active' | 'completed';
  brand_id?: string;
}) {
  const res = await request('/api/data/sprints', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchSprint(id: string, data: { name?: string; goal?: string; start_date?: string; end_date?: string; status?: 'planned' | 'active' | 'completed'; brand_id?: string }) {
  const res = await request(`/api/data/sprints/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteSprint(id: string) {
  const res = await request(`/api/data/sprints/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSprintStats(sprintId: string, deskId?: string) {
  const qs = deskId ? `?desk_id=${encodeURIComponent(deskId)}` : '';
  const res = await request(`/api/data/sprints/${sprintId}/stats${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSprintCapacity(sprintId: string, deskId?: string) {
  const qs = deskId ? `?desk_id=${encodeURIComponent(deskId)}` : '';
  const res = await request(`/api/data/sprints/${sprintId}/capacity${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSprintBrandProgress(sprintId: string) {
  const res = await request(`/api/data/sprints/${sprintId}/brand-progress`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSprintGerencial(status?: string) {
  const qs = status && status !== 'all' ? `?status=${status}` : '';
  const res = await request(`/api/data/sprints/gerencial${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSprintBurndown(sprintId: string, deskId?: string) {
  const qs = deskId ? `?desk_id=${encodeURIComponent(deskId)}` : '';
  const res = await request(`/api/data/sprints/${sprintId}/burndown${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTeamVelocity(brandId?: string) {
  const params = brandId ? `?brand_id=${brandId}` : '';
  const res = await request(`/api/data/sprints/velocity${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSprintPlanning(sprintId: string, deskId?: string) {
  const params = deskId ? `?desk_id=${encodeURIComponent(deskId)}` : '';
  const res = await request(`/api/data/sprints/${sprintId}/planning${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== RELEASES ==========
export async function getReleases(brandId?: string) {
  const params = brandId ? `?brand_id=${brandId}` : '';
  const res = await request(`/api/data/releases${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRelease(id: string) {
  const res = await request(`/api/data/releases/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createRelease(data: {
  name: string; description?: string; version?: string;
  status?: string; target_date?: string; brand_id?: string;
}) {
  const res = await request('/api/data/releases', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchRelease(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/releases/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteRelease(id: string) {
  const res = await request(`/api/data/releases/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function setReleaseSprints(releaseId: string, sprintIds: string[]) {
  const res = await request(`/api/data/releases/${releaseId}/sprints`, {
    method: 'POST', body: JSON.stringify({ sprint_ids: sprintIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface GetDeliverablesOptions {
  limit?: number;
  offset?: number;
}

export async function getDeliverables(options?: GetDeliverablesOptions): Promise<{ deliverables: unknown[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  const qs = params.toString();
  const res = await request(`/api/data/deliverables${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createDeliverable(data: { task_id: string; tipo_entregable_id?: string; version?: string; estado?: string }) {
  const res = await request('/api/data/deliverables', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchDeliverable(id: string, data: { estado?: string; link_final?: string }) {
  const res = await request(`/api/data/deliverables/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function getFiles(taskId?: string) {
  const url = taskId ? `/api/data/files?task_id=${encodeURIComponent(taskId)}` : '/api/data/files';
  const res = await request(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createFile(data: { task_id?: string; deliverable_id?: string; nombre_archivo: string; url_storage: string }) {
  const res = await request('/api/data/files', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function uploadFile(taskId: string | null, file: File, nombreArchivo?: string, onProgress?: (pct: number) => void) {
  const token = getToken();
  const fd = new FormData();
  fd.append('file', file);
  if (taskId) fd.append('task_id', taskId);
  if (nombreArchivo) fd.append('nombre_archivo', nombreArchivo);

  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/data/files/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
      } else {
        reject(new Error(xhr.responseText || 'Error al subir'));
      }
    };
    xhr.onerror = () => reject(new Error('Error de red'));
    xhr.send(fd);
  });
}

export async function uploadChatImage(file: File): Promise<{ image_url: string }> {
  const token = getToken();
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${API_URL}/api/data/chat/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function assignFilesToTask(fileIds: string[], taskId: string) {
  const res = await request('/api/data/files/assign', {
    method: 'PATCH',
    body: JSON.stringify({ file_ids: fileIds, task_id: taskId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteFile(id: string) {
  const res = await request(`/api/data/files/${id}`, { method: 'DELETE' });
  return res.json();
}

// ========== Comments ==========
export async function getComments(taskId: string) {
  const res = await request(`/api/data/tasks/${taskId}/comments`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createComment(taskId: string, comentario: string, image_url?: string, contenido_html?: string) {
  const res = await request(`/api/data/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ comentario, image_url, contenido_html }),
  });
  return res.json();
}

export async function deleteComment(commentId: string) {
  const res = await request(`/api/data/comments/${commentId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function likeComment(commentId: string) {
  const res = await request(`/api/data/comments/${commentId}/like`, { method: 'POST' });
  return res.json();
}

// ========== Activity Log ==========
export async function getActivityLog(entityType: string, entityId: string, options?: { limit?: number; offset?: number }) {
  const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  const res = await request(`/api/data/activity?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRecentActivity(limit = 50) {
  const res = await request(`/api/data/activity/recent?limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Subtasks ==========
export async function getSubtasks(taskId: string) {
  const res = await request(`/api/data/tasks/${taskId}/subtasks`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createSubtask(parentId: string, data: { titulo_tarea: string; detalle?: string; prioridad?: string; fecha_entrega?: string; responsable_user_id?: string }) {
  const res = await request(`/api/data/tasks/${parentId}/subtasks`, { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteSubtask(parentId: string, subId: string) {
  const res = await request(`/api/data/tasks/${parentId}/subtasks/${subId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function reorderSubtasks(parentId: string, orderedIds: string[]) {
  const res = await request(`/api/data/tasks/${parentId}/subtasks/reorder`, { method: 'PATCH', body: JSON.stringify({ ordered_ids: orderedIds }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Dependencies ==========
export async function getDependencies(taskId: string) {
  const res = await request(`/api/data/tasks/${taskId}/dependencies`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createDependency(taskId: string, dependsOnTaskId: string, type = 'blocks') {
  const res = await request(`/api/data/tasks/${taskId}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ depends_on_task_id: dependsOnTaskId, dependency_type: type }),
  });
  return res.json();
}

export async function deleteDependency(taskId: string, depId: string) {
  const res = await request(`/api/data/tasks/${taskId}/dependencies/${depId}`, { method: 'DELETE' });
  return res.json();
}

// ========== Bulk Actions ==========
export async function bulkUpdateTasks(taskIds: string[], updates: Record<string, unknown>) {
  const res = await request('/api/data/tasks/bulk-update', {
    method: 'POST',
    body: JSON.stringify({ task_ids: taskIds, updates }),
  });
  return res.json();
}

export async function bulkDeleteTasks(taskIds: string[]) {
  const res = await request('/api/data/tasks/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ task_ids: taskIds }),
  });
  return res.json();
}

// ========== Project Templates ==========
export async function getTemplates() {
  const res = await request('/api/data/templates');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTemplate(id: string) {
  const res = await request(`/api/data/templates/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createTemplate(data: { name: string; description?: string; is_public?: boolean }) {
  const res = await request('/api/data/templates', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchTemplate(id: string, data: { name?: string; description?: string; is_public?: boolean }) {
  const res = await request(`/api/data/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteTemplate(id: string) {
  const res = await request(`/api/data/templates/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function addTemplateTask(templateId: string, data: {
  titulo_tarea: string;
  detalle?: string;
  prioridad?: string;
  departamento?: string;
  cantidad_entregables?: number;
  story_points?: number;
  relative_start_days?: number;
  relative_due_days?: number;
  parent_template_task_id?: string | null;
  sort_order?: number;
}) {
  const res = await request(`/api/data/templates/${templateId}/tasks`, { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchTemplateTask(templateId: string, taskId: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/templates/${templateId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteTemplateTask(templateId: string, taskId: string) {
  const res = await request(`/api/data/templates/${templateId}/tasks/${taskId}`, { method: 'DELETE' });
  return res.json();
}

export async function applyTemplate(templateId: string, data: { brand_id: string; desk_id?: string; start_date?: string }) {
  const res = await request(`/api/data/templates/${templateId}/apply`, { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

// ========== Search ==========
export async function globalSearch(q: string): Promise<{
  tasks: { id: string; titulo_tarea: string; estado: string; brand_nombre?: string }[];
  deliverables: { id: string; task_id: string; titulo_tarea: string; brand_nombre?: string; estado: string }[];
}> {
  const res = await request(`/api/data/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Saved Filters ==========
export async function getSavedFilters() {
  const res = await request('/api/data/saved-filters');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createSavedFilter(data: { name: string; entity_type?: string; filter_config: Record<string, unknown>; is_default?: boolean }) {
  const res = await request('/api/data/saved-filters', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

export async function patchSavedFilter(id: string, data: { name?: string; filter_config?: Record<string, unknown>; is_default?: boolean }) {
  const res = await request(`/api/data/saved-filters/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function deleteSavedFilter(id: string) {
  const res = await request(`/api/data/saved-filters/${id}`, { method: 'DELETE' });
  return res.json();
}

// ========== Time Analytics ==========
export async function getTimeAnalytics(): Promise<{
  by_user: { user_id: string; user_name: string; total_seconds: number; task_count: number }[];
  by_brand: { brand_id: string; brand_name: string; total_seconds: number; task_count: number }[];
  top_tasks: { id: string; titulo_tarea: string; total_seconds: number; brand_name: string; resp_name: string }[];
  total_seconds: number;
}> {
  const res = await request('/api/data/time-analytics');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Public Forms (público, sin token) ==========
const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003');
export async function getPublicForm(slug: string) {
  const res = await fetch(`${API_BASE}/api/public/forms/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function submitPublicForm(slug: string, data: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/api/public/forms/${encodeURIComponent(slug)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Public Forms Admin ==========
export async function getPublicForms() {
  const res = await request('/api/data/public-forms');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getPublicFormById(id: string) {
  const res = await request(`/api/data/public-forms/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function createPublicForm(data: Record<string, unknown>) {
  const res = await request('/api/data/public-forms', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}
export async function patchPublicForm(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/public-forms/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}
export async function deletePublicForm(id: string) {
  const res = await request(`/api/data/public-forms/${id}`, { method: 'DELETE' });
  return res.json();
}
export async function getFormSubmissions(formId: string) {
  const res = await request(`/api/data/public-forms/${formId}/submissions`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Automations ==========
export async function getAutomations(brandId?: string) {
  const url = brandId ? `/api/data/automations?brand_id=${encodeURIComponent(brandId)}` : '/api/data/automations';
  const res = await request(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getAutomation(id: string) {
  const res = await request(`/api/data/automations/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function createAutomation(data: Record<string, unknown>) {
  const res = await request('/api/data/automations', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}
export async function patchAutomation(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/automations/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}
export async function deleteAutomation(id: string) {
  const res = await request(`/api/data/automations/${id}`, { method: 'DELETE' });
  return res.json();
}
export async function getAutomationLogs(id: string) {
  const res = await request(`/api/data/automations/${id}/logs`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Integrations ==========
export async function getIntegrations(brandId?: string) {
  const url = brandId ? `/api/data/integrations?brand_id=${encodeURIComponent(brandId)}` : '/api/data/integrations';
  const res = await request(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function createIntegration(data: { type: string; name: string; config: Record<string, unknown>; brand_id?: string }) {
  const res = await request('/api/data/integrations', { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}
export async function patchIntegration(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/integrations/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}
export async function deleteIntegration(id: string) {
  const res = await request(`/api/data/integrations/${id}`, { method: 'DELETE' });
  return res.json();
}

// ========== Google Calendar ==========
export async function getGoogleCalendarStatus() {
  const res = await request('/api/data/google-calendar/status');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getGoogleCalendarEvents(start: string, end: string) {
  const res = await request(`/api/data/google-calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function syncTaskToGoogleCalendar(taskId: string) {
  const res = await request(`/api/data/google-calendar/sync-task/${taskId}`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function unsyncTaskFromGoogleCalendar(taskId: string) {
  const res = await request(`/api/data/google-calendar/sync-task/${taskId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function disconnectGoogleCalendar() {
  const res = await request('/api/data/google-calendar/disconnect', { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDeskMeetings(deskId: string, start: string, end: string): Promise<{
  meetings: {
    user_id: string;
    nombre: string;
    connected: boolean;
    total_hours: number;
    events: { summary: string; start: string; end: string; duration_min: number }[];
  }[];
}> {
  const params = new URLSearchParams({ start, end });
  if (deskId && deskId !== 'all') params.set('desk_id', deskId);
  const res = await request(`/api/data/google-calendar/desk-meetings?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Google Chat Import ==========
export async function getGoogleChatSpaces(): Promise<{ spaces: { id: string; displayName: string; type: string }[] }> {
  const res = await request('/api/data/google-chat/spaces');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importGoogleChatSpace(spaceId: string, deskId: string): Promise<{ success: boolean; status: string; imported: number; skipped: number; total: number }> {
  const res = await request('/api/data/google-chat/import', {
    method: 'POST',
    body: JSON.stringify({ spaceId, deskId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getGoogleChatImportStatus(spaceId: string, deskId: string): Promise<{ status: string; imported: number; skipped: number; total: number; error?: string }> {
  const res = await request(`/api/data/google-chat/import/status?spaceId=${encodeURIComponent(spaceId)}&deskId=${encodeURIComponent(deskId)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Desk Chat Messages ==========
export async function getDeskMessages(deskId: string, params?: { limit?: number; before?: string }): Promise<{
  messages: {
    id: string;
    desk_id: string;
    user_id: string;
    mensaje: string;
    created_at: string;
    user: { nombre: string; avatar_url: string | null };
    read_by: { user_id: string; nombre: string; read_at: string }[];
  }[];
  has_more: boolean;
}> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.before) qs.set('before', params.before);
  const q = qs.toString();
  const res = await request(`/api/data/desks/${deskId}/messages${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface PresenceInfo {
  userId: string;
  status: 'online' | 'away' | 'offline';
}

export async function getDeskOnlineUsers(): Promise<{ online: string[]; presence: PresenceInfo[] }> {
  const res = await request('/api/data/desks/online-users');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDeskUnreadCounts(): Promise<{ counts: Record<string, number> }> {
  const res = await request('/api/data/desks/unread-counts');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Site config (GET público; PATCH requiere admin) ==========
export async function getSiteSettings(): Promise<Record<string, string | null>> {
  const res = await fetch(
    `${import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003')}/api/config/site-settings`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchSiteSettings(data: {
  logo_url?: string | null;
  logo_email_url?: string | null;
  favicon_url?: string | null;
  site_name?: string;
  email_from_name?: string;
  email_footer_text?: string;
  registration_enabled?: boolean;
  registration_allowed_domains?: string;
  registration_max_users?: number;
  can_delete_tasks_roles?: string;
  scrum_desk_id?: string | null;
  daily_meetings_desk_ids?: string;
  daily_meetings_roles?: string;
  notification_sound_enabled?: string;
  notification_sound_type?: string;
  chat_enabled?: string;
  drive_enabled?: string;
  gemini_enabled?: string;
}) {
  const res = await request('/api/config/site-settings', { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function patchRegistrationSettings(data: {
  registration_enabled: boolean;
  registration_allowed_domains: string;
  registration_max_users: number;
}) {
  const res = await request('/api/config/registration-settings', { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function uploadFavicon(file: File): Promise<{ success: boolean; favicon_url?: string; error?: string }> {
  const token = getToken();
  const formData = new FormData();
  formData.append('favicon', file);

  const base = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003');
  const res = await fetch(
    `${base}/api/config/upload-favicon`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }
  );
  return res.json();
}

export async function getEmailTemplates(): Promise<Array<{ id: string; type: string; subject_template: string; html_template: string | null; updated_at: string }>> {
  const res = await request('/api/config/email-templates');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchEmailTemplate(type: string, data: { subject_template?: string; html_template?: string | null }) {
  const res = await request(`/api/config/email-templates/${encodeURIComponent(type)}`, { method: 'PATCH', body: JSON.stringify(data) });
  return res.json();
}

export async function getEmailTemplatePreview(type: string, html?: string | null): Promise<{ html: string }> {
  const res = await request('/api/config/email-templates/preview', {
    method: 'POST',
    body: JSON.stringify({ type, html }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Google Drive ==========
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  size?: number | null;
  modifiedTime?: string;
  isFolder: boolean;
}

export async function getDriveStatus(): Promise<{ connected: boolean; hasDriveScope: boolean }> {
  const res = await request('/api/data/google-drive/status');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDriveFiles(folderId?: string, pageToken?: string, pageSize = 30): Promise<{ files: DriveFile[]; nextPageToken: string | null; folderName: string }> {
  const params = new URLSearchParams();
  if (folderId) params.set('folderId', folderId);
  if (pageToken) params.set('pageToken', pageToken);
  params.set('pageSize', String(pageSize));
  const res = await request(`/api/data/google-drive/files?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function searchDriveFiles(q: string): Promise<{ files: DriveFile[] }> {
  const res = await request(`/api/data/google-drive/files/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTaskDriveFiles(taskId: string): Promise<any[]> {
  const res = await request(`/api/data/google-drive/task-files/${taskId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function attachDriveFile(taskId: string, file: DriveFile) {
  const res = await request('/api/data/google-drive/task-files', {
    method: 'POST',
    body: JSON.stringify({
      task_id: taskId,
      drive_file_id: file.id,
      name: file.name,
      mime_type: file.mimeType,
      icon_url: file.iconLink,
      web_view_link: file.webViewLink,
      thumbnail_url: file.thumbnailLink,
      size_bytes: file.size,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function detachDriveFile(id: string) {
  const res = await request(`/api/data/google-drive/task-files/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Gemini AI ==========
export async function sendGeminiMessage(message: string, conversationId?: string, context?: { type?: 'tasks' | 'project' | 'general'; entity_ids?: string[] }): Promise<{ response: string; conversation_id: string }> {
  const res = await request('/api/data/gemini/chat', {
    method: 'POST',
    body: JSON.stringify({ message, conversation_id: conversationId, context }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getGeminiConversations(): Promise<any[]> {
  const res = await request('/api/data/gemini/conversations');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getGeminiConversation(id: string): Promise<{ id: string; title: string; messages: { id: string; role: 'user' | 'model'; content: string; created_at: string }[] }> {
  const res = await request(`/api/data/gemini/conversations/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteGeminiConversation(id: string) {
  const res = await request(`/api/data/gemini/conversations/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getGeminiSummary(type: 'tasks' | 'comments' | 'sprint' | 'general', entityIds: string[]): Promise<{ summary: string }> {
  const res = await request('/api/data/gemini/summarize', {
    method: 'POST',
    body: JSON.stringify({ type, entity_ids: entityIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Custom Fields ==========
export async function getCustomFieldDefinitions(brandId?: string) {
  const url = brandId
    ? `/api/data/custom-fields/definitions?brand_id=${encodeURIComponent(brandId)}`
    : '/api/data/custom-fields/definitions';
  const res = await request(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createCustomFieldDefinition(data: Record<string, unknown>) {
  const res = await request('/api/data/custom-fields/definitions', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchCustomFieldDefinition(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/custom-fields/definitions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteCustomFieldDefinition(id: string) {
  const res = await request(`/api/data/custom-fields/definitions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTaskCustomFields(taskId: string) {
  const res = await request(`/api/data/tasks/${taskId}/custom-fields`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveTaskCustomFields(taskId: string, fields: { field_id: string; value: unknown }[]) {
  const res = await request(`/api/data/tasks/${taskId}/custom-fields`, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Custom Dashboards ==========
export async function getDashboards() {
  const res = await request('/api/data/dashboards');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getDashboard(id: string) {
  const res = await request(`/api/data/dashboards/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createDashboard(data: Record<string, unknown>) {
  const res = await request('/api/data/dashboards', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchDashboard(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/dashboards/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteDashboard(id: string) {
  const res = await request(`/api/data/dashboards/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWidgetData(type: string, brandId?: string) {
  const url = brandId
    ? `/api/data/dashboards/widget-data/${type}?brand_id=${encodeURIComponent(brandId)}`
    : `/api/data/dashboards/widget-data/${type}`;
  const res = await request(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Time Sessions (Time Doctor) ==========
export async function getActiveTimeSession() {
  const res = await request('/api/data/time-sessions/active');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startTimeSession(taskId: string) {
  const res = await request('/api/data/time-sessions/start', { method: 'POST', body: JSON.stringify({ task_id: taskId }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function stopTimeSession(sessionId: string) {
  const res = await request(`/api/data/time-sessions/${sessionId}/stop`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function pauseTimeSession(sessionId: string) {
  const res = await request(`/api/data/time-sessions/${sessionId}/pause`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function resumeTimeSession(sessionId: string) {
  const res = await request(`/api/data/time-sessions/${sessionId}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTimeSessions(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await request(`/api/data/time-sessions?${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Activity Tracking ==========
export async function postActivitySnapshot(timeEntryId: string, counts: { keyboard: number; mouse: number; scroll: number; click: number }) {
  const res = await request('/api/data/activity-tracking/snapshot', {
    method: 'POST',
    body: JSON.stringify({ time_entry_id: timeEntryId, keyboard_events: counts.keyboard, mouse_events: counts.mouse, scroll_events: counts.scroll, click_events: counts.click }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function uploadScreenshot(timeEntryId: string, taskId: string, imageBase64: string) {
  const res = await request('/api/data/activity-tracking/screenshot', {
    method: 'POST',
    body: JSON.stringify({ time_entry_id: timeEntryId, task_id: taskId, image_base64: imageBase64 }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getScreenshots(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await request(`/api/data/activity-tracking/screenshots?${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Attendance ==========
export async function checkIn(notes?: string) {
  const res = await request('/api/data/attendance/check-in', { method: 'POST', body: JSON.stringify({ notes }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function checkOut() {
  const res = await request('/api/data/attendance/check-out', { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTodayAttendance() {
  const res = await request('/api/data/attendance/today');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getAttendanceRecords(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await request(`/api/data/attendance?${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Team Monitor (Admin) ==========
export async function getTeamLiveStatus() {
  const res = await request('/api/data/team-monitor/live');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTeamDailySummary(date?: string) {
  const qs = date ? `?date=${date}` : '';
  const res = await request(`/api/data/team-monitor/daily-summary${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTeamScreenshots(userId: string, date?: string) {
  const params = new URLSearchParams({ user_id: userId });
  if (date) params.set('date', date);
  const res = await request(`/api/data/team-monitor/screenshots?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTeamProductivity(dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  const res = await request(`/api/data/team-monitor/productivity?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTeamAttendance(dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  const res = await request(`/api/data/team-monitor/attendance?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== WhatsApp ==========

export async function getWAStatus() {
  const res = await request('/api/data/whatsapp/status');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function connectWA() {
  const res = await request('/api/data/whatsapp/connect', { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function disconnectWA() {
  const res = await request('/api/data/whatsapp/disconnect', { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function syncWAGroups() {
  const res = await request('/api/data/whatsapp/sync-groups', { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWAGroups() {
  const res = await request('/api/data/whatsapp/groups');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchWAGroup(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/whatsapp/groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWAGroupMembers(groupId: string) {
  const res = await request(`/api/data/whatsapp/groups/${groupId}/members`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchWAMember(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/whatsapp/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWAMessages(params: { group_id?: string; limit?: number; offset?: number; sla?: string }) {
  const qs = new URLSearchParams();
  if (params.group_id) qs.set('group_id', params.group_id);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  if (params.sla) qs.set('sla', params.sla);
  const res = await request(`/api/data/whatsapp/messages?${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWASlaRules() {
  const res = await request('/api/data/whatsapp/sla-rules');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createWASlaRule(data: Record<string, unknown>) {
  const res = await request('/api/data/whatsapp/sla-rules', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function patchWASlaRule(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/whatsapp/sla-rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteWASlaRule(id: string) {
  const res = await request(`/api/data/whatsapp/sla-rules/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWAStats() {
  const res = await request('/api/data/whatsapp/stats');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


// ========== Metrics & Cumplimiento ==========

export async function getDeadlineHistory(taskId: string) {
  const res = await request(`/api/data/tasks/${taskId}/deadline-history`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    task_id: string;
    fecha_entrega_actual: string | null;
    fecha_entrega_original: string | null;
    reschedule_count: number;
    history: Array<{ old: string | null; new: string | null; motivo: string; comentario: string | null; by: string; by_user_id: string | null; at: string }>;
  }>;
}

export interface CumplimientoFilters {
  from?: string;
  to?: string;
  desk_id?: string;
  responsable_id?: string;
}

export interface CumplimientoResponsable {
  user_id: string;
  nombre: string;
  email: string | null;
  avatar_url: string | null;
  rol: string | null;
  tareas_total: number;
  entregadas_a_tiempo: number;
  entregadas_tarde: number;
  vencidas_no_entregadas: number;
  en_proceso: number;
  promedio_reschedules: number;
  porcentaje_cumplimiento: number | null;
}

export async function getCumplimiento(filters: CumplimientoFilters = {}) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.desk_id) params.set('desk_id', filters.desk_id);
  if (filters.responsable_id) params.set('responsable_id', filters.responsable_id);
  const qs = params.toString();
  const res = await request(`/api/data/metrics/cumplimiento${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    from: string;
    to: string;
    total_responsables: number;
    total_tareas: number;
    responsables: CumplimientoResponsable[];
  }>;
}

// ========== Incidencias / Novedades ==========

export interface Incidencia {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: 'BUG' | 'MEJORA' | 'QUEJA' | 'CONSULTA';
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  estado: 'ABIERTO' | 'EN_PROGRESO' | 'RESUELTO' | 'CERRADO';
  modulo: string | null;
  creado_por_id: string | null;
  asignado_a_id: string | null;
  fecha_creacion: string;
  fecha_actualizacion: string;
  fecha_cierre: string | null;
  creado_por_nombre?: string | null;
  creado_por_avatar?: string | null;
  asignado_a_nombre?: string | null;
  asignado_a_avatar?: string | null;
  comentarios_count?: number;
}

export interface IncidenciaKPIs {
  abiertos: number;
  en_progreso: number;
  resueltos: number;
  cerrados: number;
  total: number;
  horas_promedio: number | null;
}

export interface IncidenciaComentario {
  id: string;
  incidencia_id: string;
  usuario_id: string;
  comentario: string;
  es_resolucion: number;
  fecha: string;
  usuario_nombre?: string | null;
  usuario_avatar?: string | null;
}

export interface IncidenciaActividad {
  id: string;
  incidencia_id: string;
  usuario_id: string;
  accion: string;
  fecha: string;
  usuario_nombre?: string | null;
  usuario_avatar?: string | null;
}

export interface IncidenciaFilters {
  estado?: string;
  tipo?: string;
  prioridad?: string;
  modulo?: string;
  limit?: number;
  offset?: number;
}

export async function getIncidencias(filters: IncidenciaFilters = {}) {
  const params = new URLSearchParams();
  if (filters.estado && filters.estado !== 'all') params.set('estado', filters.estado);
  if (filters.tipo && filters.tipo !== 'all') params.set('tipo', filters.tipo);
  if (filters.prioridad && filters.prioridad !== 'all') params.set('prioridad', filters.prioridad);
  if (filters.modulo && filters.modulo !== 'all') params.set('modulo', filters.modulo);
  if (filters.limit != null) params.set('limit', String(filters.limit));
  if (filters.offset != null) params.set('offset', String(filters.offset));
  const qs = params.toString();
  const res = await request(`/api/data/incidencias${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ incidencias: Incidencia[]; total: number; kpis: IncidenciaKPIs }>;
}

export async function getIncidencia(id: string) {
  const res = await request(`/api/data/incidencias/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ incidencia: Incidencia; comentarios: IncidenciaComentario[]; actividad: IncidenciaActividad[] }>;
}

export async function createIncidencia(data: {
  titulo: string;
  descripcion?: string;
  tipo?: string;
  prioridad?: string;
  modulo?: string;
}) {
  const res = await request('/api/data/incidencias', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Incidencia>;
}

export async function addIncidenciaComentario(id: string, comentario: string, esResolucion = false) {
  const res = await request(`/api/data/incidencias/${id}/comentarios`, {
    method: 'POST',
    body: JSON.stringify({ comentario, es_resolucion: esResolucion }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<IncidenciaComentario>;
}

export async function setIncidenciaEstado(id: string, estado: string) {
  const res = await request(`/api/data/incidencias/${id}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function setIncidenciaPrioridad(id: string, prioridad: string) {
  const res = await request(`/api/data/incidencias/${id}/prioridad`, {
    method: 'PATCH',
    body: JSON.stringify({ prioridad }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function asignarIncidencia(id: string, asignadoAId: string | null) {
  const res = await request(`/api/data/incidencias/${id}/asignar`, {
    method: 'PATCH',
    body: JSON.stringify({ asignado_a_id: asignadoAId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteIncidencia(id: string) {
  const res = await request(`/api/data/incidencias/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getIncidenciaAsignables() {
  const res = await request('/api/data/incidencias-asignables');
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Array<{ id: string; nombre: string; email: string; avatar_url: string | null; rol: string }>>;
}

export interface Novedad {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: 'FEATURE' | 'FIX' | 'MEJORA' | 'SEGURIDAD';
  version: string | null;
  incidencia_id: string | null;
  creado_por_id: string;
  fecha: string;
  creado_por_nombre?: string | null;
  creado_por_avatar?: string | null;
  incidencia_titulo?: string | null;
}

export async function getNovedades() {
  const res = await request('/api/data/novedades');
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ novedades: Novedad[] }>;
}

export async function createNovedad(data: {
  titulo: string;
  descripcion?: string;
  tipo?: string;
  version?: string;
  incidencia_id?: string;
}) {
  const res = await request('/api/data/novedades', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Novedad>;
}

export async function deleteNovedad(id: string) {
  const res = await request(`/api/data/novedades/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== API Tokens (MCP de Tiusdei) ==========
export interface ApiToken {
  id: string;
  token_prefix: string;
  label: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export async function getApiTokens() {
  const res = await request("/api/data/api-tokens");
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ApiToken[]>;
}

export async function createApiToken(label?: string) {
  const res = await request("/api/data/api-tokens", {
    method: "POST",
    body: JSON.stringify({ label: label || undefined }),
  });
  if (!res.ok) {
    const txt = await res.text();
    try { throw new Error(JSON.parse(txt).error || txt); } catch { throw new Error(txt); }
  }
  return res.json() as Promise<{
    id: string;
    token: string;
    token_prefix: string;
    label: string;
    created_at: string;
  }>;
}

export async function revokeApiToken(id: string) {
  const res = await request(`/api/data/api-tokens/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: true }>;
}

// ========== Editor: upload de imagen inline (paste/drag&drop) ==========
export async function uploadEditorImage(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("image", file);
  const token = localStorage.getItem("tiusdei_token") || localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/data/editor/upload-image`, {
    method: "POST",
    headers,
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Timers activos del usuario ==========
export interface ActiveTimer {
  id: string;
  titulo: string;
  brand_nombre: string | null;
  timer_inicio: string;
  tiempo_trabajado: number;
}

export async function getActiveTimers(): Promise<ActiveTimer[]> {
  const res = await request("/api/data/tasks/active-timer");
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ActiveTimer[]>;
}

// ========== Departamentos / Pipeline / Handoff ==========
export interface Department {
  id: string;
  nombre: string;
  orden: number;
  color: string | null;
  next_department_id: string | null;
  next_department_nombre?: string | null;
  activo: boolean;
}

export interface DepartmentMetric {
  department_id: string;
  nombre: string;
  color: string | null;
  periodos: number;
  tareas: number;
  abiertos: number;
  avg_seconds: number;
  avg_horas: number;
  avg_dias: number;
}

export async function getDepartments() {
  const res = await request('/api/data/departments');
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Department[]>;
}

export async function createDepartment(data: { nombre: string; orden?: number; color?: string; next_department_id?: string | null }) {
  const res = await request('/api/data/departments', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const t = await res.text(); try { throw new Error(JSON.parse(t).error || t); } catch { throw new Error(t); } }
  return res.json() as Promise<Department>;
}

export async function patchDepartment(id: string, data: Partial<{ nombre: string; orden: number; color: string; next_department_id: string | null; activo: boolean }>) {
  const res = await request(`/api/data/departments/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) { const t = await res.text(); try { throw new Error(JSON.parse(t).error || t); } catch { throw new Error(t); } }
  return res.json() as Promise<Department>;
}

export async function deleteDepartment(id: string) {
  const res = await request(`/api/data/departments/${id}`, { method: 'DELETE' });
  if (!res.ok) { const t = await res.text(); try { throw new Error(JSON.parse(t).error || t); } catch { throw new Error(t); } }
  return res.json() as Promise<{ ok: true }>;
}

export async function taskHandoff(taskId: string, data: {
  to_department_id: string;
  to_responsable_ids?: string[];
  motivo?: string;
  due_date?: string;
  create_new_task?: boolean;
}) {
  const res = await request(`/api/data/tasks/${taskId}/handoff`, { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const t = await res.text(); try { throw new Error(JSON.parse(t).error || t); } catch { throw new Error(t); } }
  return res.json() as Promise<{ ok: true; target_task_id: string | null; same_task: boolean }>;
}

export async function getDepartmentMetrics(params: { desk_id?: string; brand_id?: string; from?: string; to?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.desk_id) qs.set('desk_id', params.desk_id);
  if (params.brand_id) qs.set('brand_id', params.brand_id);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const q = qs.toString();
  const res = await request(`/api/data/metrics/department-times${q ? '?' + q : ''}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ from: string | null; to: string | null; departments: DepartmentMetric[] }>;
}

// ========== Consola interna de errores (admin) ==========
export interface ErrorLog {
  id: string;
  level: string;
  tag: string | null;
  message: string;
  stack: string | null;
  route: string | null;
  method: string | null;
  status_code: number | null;
  user_id: string | null;
  user_nombre: string | null;
  count: number;
  resolved: boolean;
  created_at: string;
  last_seen_at: string;
}

export async function getErrorLogs(params: { resolved?: 0 | 1; level?: string; q?: string; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.resolved === 0 || params.resolved === 1) qs.set('resolved', String(params.resolved));
  if (params.level) qs.set('level', params.level);
  if (params.q) qs.set('q', params.q);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  const res = await request(`/api/data/error-logs${q ? '?' + q : ''}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ logs: ErrorLog[]; total: number; limit: number; offset: number }>;
}

export async function getErrorLogStats() {
  const res = await request('/api/data/error-logs/stats');
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ abiertos: number; resueltos: number; ultima_hora: number; fatales: number }>;
}

export async function resolveErrorLog(id: string, resolved = true) {
  const res = await request(`/api/data/error-logs/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolved }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function resolveAllErrorLogs() {
  const res = await request('/api/data/error-logs/resolve-all', { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function clearErrorLogs(all = false) {
  const res = await request(`/api/data/error-logs${all ? '?all=1' : ''}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Agente de mantenimiento (chat admin) ==========
export interface AgentMessage { id: string; role: 'user' | 'assistant' | 'system' | 'tool'; content: string; created_at: string; }
export interface AgentSession { id: string; titulo: string | null; status: 'idle' | 'running'; created_at: string; updated_at: string; }
export interface AgentAction { id: string; origen: string; tipo: string; titulo: string; detalle: string | null; estado: string; riesgo: string; created_at: string; }

export async function getAgentSessions() {
  const res = await request('/api/data/agent/sessions');
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AgentSession[]>;
}

export async function getAgentMessages(sessionId: string) {
  const res = await request(`/api/data/agent/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ status: 'idle' | 'running'; messages: AgentMessage[] }>;
}

export async function sendAgentChat(message: string, sessionId?: string, imagePaths: string[] = []) {
  const res = await request('/api/data/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ message, session_id: sessionId, image_paths: imagePaths }),
  });
  if (!res.ok) { const t = await res.text(); try { throw new Error(JSON.parse(t).error || t); } catch { throw new Error(t); } }
  return res.json() as Promise<{ session_id: string; status: string }>;
}

export async function uploadAgentImage(file: File): Promise<{ path: string }> {
  const fd = new FormData();
  fd.append('image', file);
  const token = localStorage.getItem('tiusdei_token');
  const res = await fetch(`${API_BASE}/api/data/agent/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getAgentActions() {
  const res = await request('/api/data/agent/actions');
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AgentAction[]>;
}

export async function agentPromote() {
  const res = await request('/api/data/agent/promote', { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ action_id: string; status: string }>;
}

// ========== Módulo de clientes (interno + público) ==========
export interface ClientBoard {
  id: string;
  brand_id: string;
  brand_nombre?: string;
  token: string;
  cliente_nombre: string | null;
  titulo: string | null;
  activo: boolean;
  created_at: string;
  tareas?: number;
  requests_pendientes?: number;
}
export interface ClientBoardTask {
  id: string;
  titulo_tarea: string;
  estado: string;
  fecha_cliente: string | null;
  fecha_entrega: string | null;
  created_at: string;
  enlaces?: string | null;
  responsable_nombre?: string | null;
}
export interface ClientRequest {
  id: string;
  titulo: string;
  detalle: string | null;
  autor_nombre: string | null;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  task_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

// --- interno (ejecutivos) ---
export async function getClientBoards() {
  const res = await request('/api/data/client-boards');
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ClientBoard[]>;
}
export async function createClientBoard(data: { brand_id: string; cliente_nombre?: string; titulo?: string }) {
  const res = await request('/api/data/client-boards', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const t = await res.text(); try { throw new Error(JSON.parse(t).error || t); } catch { throw new Error(t); } }
  return res.json() as Promise<ClientBoard>;
}
export async function getClientBoard(id: string) {
  const res = await request(`/api/data/client-boards/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ board: ClientBoard; tasks: ClientBoardTask[] }>;
}
export async function createClientTask(boardId: string, data: { titulo_tarea: string; fecha_cliente?: string; detalle?: string }) {
  const res = await request(`/api/data/client-boards/${boardId}/tasks`, { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const t = await res.text(); try { throw new Error(JSON.parse(t).error || t); } catch { throw new Error(t); } }
  return res.json() as Promise<ClientBoardTask>;
}
export async function getClientRequests(boardId: string) {
  const res = await request(`/api/data/client-boards/${boardId}/requests`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ClientRequest[]>;
}
export async function resolveClientRequest(boardId: string, requestId: string, accion: 'aprobar' | 'rechazar', fecha_cliente?: string) {
  const res = await request(`/api/data/client-boards/${boardId}/requests/${requestId}`, {
    method: 'PATCH', body: JSON.stringify({ accion, fecha_cliente }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- público (cliente sin login, no usa request()/token de sesión) ---
export interface PublicClientTask {
  id: string; titulo: string; estado: string; estado_raw: string;
  fecha_cliente: string | null; creada: string; dias_atraso: number; links: string[];
}
export async function getPublicClientBoard(token: string) {
  const res = await fetch(`${API_BASE}/api/public/client/${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error('Tablero no disponible');
  return res.json() as Promise<{ titulo: string; marca: string; cliente_nombre: string | null; tasks: PublicClientTask[] }>;
}
export async function getPublicTaskComments(token: string, taskId: string) {
  const res = await fetch(`${API_BASE}/api/public/client/${encodeURIComponent(token)}/tasks/${taskId}/comments`);
  if (!res.ok) throw new Error('No disponible');
  return res.json() as Promise<{ id: string; autor_nombre: string; es_interno: boolean; comentario: string; created_at: string }[]>;
}
export async function postPublicComment(token: string, taskId: string, autor_nombre: string, comentario: string) {
  const res = await fetch(`${API_BASE}/api/public/client/${encodeURIComponent(token)}/tasks/${taskId}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autor_nombre, comentario }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function postPublicRequest(token: string, data: { titulo: string; detalle?: string; autor_nombre: string }) {
  const res = await fetch(`${API_BASE}/api/public/client/${encodeURIComponent(token)}/requests`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Comentarios internos del tablero cliente (atribuye al usuario logueado)
export async function getClientTaskComments(boardId: string, taskId: string) {
  const res = await request(`/api/data/client-boards/${boardId}/tasks/${taskId}/comments`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ id: string; autor_nombre: string; es_interno: boolean; comentario: string; created_at: string }[]>;
}
export async function postClientTaskComment(boardId: string, taskId: string, comentario: string) {
  const res = await request(`/api/data/client-boards/${boardId}/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ comentario }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Cliente público: cambiar status (aprobar/pedir cambios) + subir imagen
export async function setPublicTaskStatus(token: string, taskId: string, estado: "aprobado" | "en_proceso", autor_nombre: string) {
  const res = await fetch(`${API_BASE}/api/public/client/${encodeURIComponent(token)}/tasks/${taskId}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado, autor_nombre }),
  });
  if (!res.ok) { const t = await res.text(); try { throw new Error(JSON.parse(t).error || t); } catch { throw new Error(t); } }
  return res.json();
}
export async function uploadPublicClientImage(token: string, file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch(`${API_BASE}/api/public/client/${encodeURIComponent(token)}/upload-image`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ========== Proyectos (Cliente → Proyecto → Tareas) ==========
export interface Project {
  id: string; brand_id: string; brand_nombre?: string;
  nombre: string; descripcion: string | null;
  estado: "en_curso" | "pausado" | "terminado" | "cancelado";
  salud: "verde" | "amarillo" | "rojo"; salud_manual: boolean;
  fecha_inicio: string | null; fecha_fin: string | null;
  lider_user_id: string | null; lider_nombre?: string | null;
  desk_id: string | null; color: string | null; activo: boolean;
  total_tareas: number; tareas_listas: number; vencidas: number; avance: number;
  created_at: string;
}
export interface ProjectTask {
  id: string; titulo_tarea: string; estado: string; prioridad: string;
  fecha_entrega: string | null; fecha_cliente: string | null; created_at: string;
  responsable_nombre: string | null; responsable_avatar: string | null;
}
export async function getProjects(params: { brand_id?: string; estado?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.brand_id) qs.set("brand_id", params.brand_id);
  if (params.estado) qs.set("estado", params.estado);
  const q = qs.toString();
  const res = await request(`/api/data/projects${q ? "?" + q : ""}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Project[]>;
}
export async function getProject(id: string) {
  const res = await request(`/api/data/projects/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ project: Project; tasks: ProjectTask[] }>;
}
export async function createProject(data: Record<string, unknown>) {
  const res = await request("/api/data/projects", { method: "POST", body: JSON.stringify(data) });
  if (!res.ok) { const t = await res.text(); try { throw new Error(JSON.parse(t).error || t); } catch { throw new Error(t); } }
  return res.json() as Promise<Project>;
}
export async function patchProject(id: string, data: Record<string, unknown>) {
  const res = await request(`/api/data/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Project>;
}
export async function deleteProject(id: string) {
  const res = await request(`/api/data/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function assignTasksToProject(id: string, task_ids: string[]) {
  const res = await request(`/api/data/projects/${id}/assign-tasks`, { method: "POST", body: JSON.stringify({ task_ids }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
