import { supabase } from '@/integrations/supabase/client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Make an authenticated request to the backend API.
 * Automatically includes the Supabase JWT token.
 */
async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
}

// ===== EMAIL API =====

export async function sendTaskNotification(data: {
  taskTitle: string;
  brandName: string;
  fechaEntrega: string;
  prioridad: string;
  recipientEmail: string;
  recipientName: string;
}): Promise<{ success: boolean }> {
  const res = await apiRequest('/api/email/task-notification', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function sendStatusChangeEmail(data: {
  taskId: string;
  taskTitle: string;
  oldStatus: string;
  newStatus: string;
  recipientUserId: string;
}): Promise<{ success: boolean }> {
  const res = await apiRequest('/api/email/status-change', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

// ===== NOTIFICATIONS API =====

export interface Notification {
  id: string;
  user_id: string;
  mensaje: string;
  task_id: string | null;
  leida: boolean;
  created_at: string;
  tasks?: { titulo_tarea: string } | null;
}

export async function getNotifications(options?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<{ notifications: Notification[] }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.unreadOnly) params.set('unread', 'true');

  const res = await apiRequest(`/api/notifications?${params.toString()}`);
  return res.json();
}

export async function getNotificationCount(): Promise<{ count: number }> {
  const res = await apiRequest('/api/notifications/count');
  return res.json();
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest('/api/notifications/read-all', { method: 'PATCH' });
}

// ===== WEBHOOKS API =====

export async function triggerExternalWebhook(data: {
  action: 'notify_user' | 'send_email' | 'update_task_status';
  payload: Record<string, unknown>;
}): Promise<{ success: boolean }> {
  const res = await apiRequest('/api/webhooks/external', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

// ===== HEALTH CHECK =====

export async function checkApiHealth(): Promise<{
  status: string;
  checks: Record<string, string>;
}> {
  const res = await fetch(`${API_URL}/api/health`);
  return res.json();
}
