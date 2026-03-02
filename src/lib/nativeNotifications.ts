let permissionGranted = Notification.permission === 'granted';

export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

export function isPermissionGranted(): boolean {
  return permissionGranted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission === 'granted') {
    permissionGranted = true;
    return true;
  }
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  permissionGranted = result === 'granted';
  return permissionGranted;
}

interface NativeNotifOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export function showNativeNotification({ title, body, icon, tag, data }: NativeNotifOptions) {
  if (!permissionGranted) return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;

  const iconUrl = icon || '/pwa-192x192.png';

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        icon: iconUrl,
        badge: iconUrl,
        tag: tag || 'tiusdei-' + Date.now(),
        data,
        requireInteraction: false,
        silent: false,
      });
    }).catch(() => {
      fallbackNotification(title, body, iconUrl, tag, data);
    });
  } else {
    fallbackNotification(title, body, iconUrl, tag, data);
  }
}

function fallbackNotification(
  title: string, body: string, icon: string,
  tag?: string, data?: Record<string, unknown>
) {
  new Notification(title, { body, icon, tag: tag || undefined, data: data as any });
}

export function updateBadgeCount(count: number) {
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      (navigator as any).setAppBadge(count).catch(() => {});
    } else {
      (navigator as any).clearAppBadge().catch(() => {});
    }
  }
}
