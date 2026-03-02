import { useEffect } from 'react';
import * as api from '@/lib/apiClient';

export function FaviconUpdater() {
  useEffect(() => {
    api.getSiteSettings()
      .then((s) => {
        const siteName = s?.site_name || 'TIUSDEI';
        document.title = siteName;

        const faviconUrl = s?.favicon_url;
        if (faviconUrl) {
          const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (link) {
            link.href = faviconUrl;
          } else {
            const newLink = document.createElement('link');
            newLink.rel = 'icon';
            newLink.href = faviconUrl;
            document.head.appendChild(newLink);
          }
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
