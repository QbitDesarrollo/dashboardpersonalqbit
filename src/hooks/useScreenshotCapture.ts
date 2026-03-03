import { useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import * as api from '@/lib/apiClient';
import { toast } from 'sonner';

/**
 * Captures periodic screenshots of the current tab while a session is active.
 * Uses html2canvas (already in project) to capture the DOM.
 */
export function useScreenshotCapture(
  activeSessionId: string | null,
  taskId: string | null,
  intervalMinutes: number = 5
) {
  const intervalRef = useRef<number | null>(null);
  const capturingRef = useRef(false);

  useEffect(() => {
    if (!activeSessionId || !taskId || intervalMinutes <= 0) return;

    const capture = async () => {
      if (capturingRef.current) return;
      capturingRef.current = true;

      try {
        const canvas = await html2canvas(document.body, {
          scale: 0.5, // Lower resolution for smaller file size
          useCORS: true,
          logging: false,
          backgroundColor: null,
        });

        // Convert to JPEG base64 (smaller than PNG)
        const base64 = canvas.toDataURL('image/jpeg', 0.6);

        await api.uploadScreenshot(activeSessionId, taskId, base64);
      } catch {
        // Silent fail - screenshot capture shouldn't break the app
      } finally {
        capturingRef.current = false;
      }
    };

    // First capture after 1 minute
    const timeout = window.setTimeout(capture, 60000);
    // Then every intervalMinutes
    intervalRef.current = window.setInterval(capture, intervalMinutes * 60 * 1000);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeSessionId, taskId, intervalMinutes]);
}
