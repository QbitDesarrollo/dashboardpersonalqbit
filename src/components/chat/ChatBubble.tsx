import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatPanel } from './ChatPanel';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import * as api from '@/lib/apiClient';
import { playNotificationSound, type SoundType } from '@/lib/notificationSound';
import { showNativeNotification, updateBadgeCount } from '@/lib/nativeNotifications';
import { useAuth } from '@/contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003');

interface ChatPreview {
  deskId: string;
  deskName: string;
  messageId: string;
  sender: string;
  senderAvatar: string | null;
  text: string;
  created_at: string;
}

interface ChatBubbleProps {
  soundEnabled?: boolean;
  soundType?: SoundType;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function ChatBubble({ soundEnabled = true, soundType = 'chime' }: ChatBubbleProps) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [preview, setPreview] = useState<ChatPreview | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const socketRef = useRef<ReturnType<typeof import('socket.io-client').io> | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const soundTypeRef = useRef(soundType);
  soundEnabledRef.current = soundEnabled;
  soundTypeRef.current = soundType;

  const fetchUnread = useCallback(async () => {
    try {
      const data = await api.getDeskUnreadCounts();
      const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
      setTotalUnread(total);
      updateBadgeCount(total);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  useEffect(() => {
    const handler = () => {
      setPreview(null);
      setOpen(true);
      fetchUnread();
    };
    window.addEventListener('open-desk-chat', handler);
    return () => window.removeEventListener('open-desk-chat', handler);
  }, [fetchUnread]);

  // Socket for preview notifications
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('tiusdei_token');
    if (!token) return;

    let cancelled = false;

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;
      const socket = io(API_URL.replace(/\/$/, ''), {
        auth: { token },
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
      });

      socket.on('desk:chat:preview', (data: ChatPreview) => {
        if (cancelled) return;
        setPreview(data);
        setTotalUnread(prev => {
          const next = prev + 1;
          updateBadgeCount(next);
          return next;
        });

        if (soundEnabledRef.current) {
          playNotificationSound(soundTypeRef.current);
        }

        showNativeNotification({
          title: `Chat: ${data.deskName}`,
          body: `${data.sender}: ${data.text}`,
          tag: `chat-${data.deskId}-${data.messageId}`,
          data: { type: 'chat', deskName: data.deskName, url: '/' },
        });

        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        previewTimerRef.current = setTimeout(() => {
          setPreview(null);
        }, 6000);
      });

      socketRef.current = socket;
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Activity detection: send heartbeat on user interaction
  useEffect(() => {
    let lastPing = 0;
    const THROTTLE = 30000; // 30 seconds

    const sendPing = () => {
      const now = Date.now();
      if (now - lastPing < THROTTLE) return;
      lastPing = now;
      if (socketRef.current?.connected) {
        socketRef.current.emit('user:activity');
      }
    };

    window.addEventListener('mousemove', sendPing, { passive: true });
    window.addEventListener('keydown', sendPing, { passive: true });
    window.addEventListener('click', sendPing, { passive: true });
    window.addEventListener('touchstart', sendPing, { passive: true });
    window.addEventListener('scroll', sendPing, { passive: true });

    return () => {
      window.removeEventListener('mousemove', sendPing);
      window.removeEventListener('keydown', sendPing);
      window.removeEventListener('click', sendPing);
      window.removeEventListener('touchstart', sendPing);
      window.removeEventListener('scroll', sendPing);
    };
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bubbleRef.current && !bubbleRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setTimeout(fetchUnread, 500);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, fetchUnread]);

  const handleOpen = () => {
    const wasOpen = open;
    setOpen(prev => !prev);
    if (!wasOpen) {
      setPreview(null);
      fetchUnread();
    } else {
      setTimeout(fetchUnread, 500);
    }
  };

  const handlePreviewClick = () => {
    setPreview(null);
    setOpen(true);
  };

  const dismissPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
  };

  return (
    <>
      {/* Chat Panel */}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            'fixed z-50 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col',
            'bottom-20 right-4 sm:right-6 w-[380px] sm:w-[400px] h-[560px]',
            'max-sm:inset-x-2 max-sm:bottom-20 max-sm:top-16 max-sm:w-auto max-sm:h-auto max-sm:rounded-xl',
            'animate-scale-in origin-bottom-right'
          )}
        >
          <ChatPanel soundEnabled={soundEnabled} soundType={soundType} onUnreadChange={setTotalUnread} />
        </div>
      )}

      {/* Preview toast - like Google Chat */}
      {preview && !open && (
        <div
          onClick={handlePreviewClick}
          className={cn(
            'fixed z-50 bottom-20 right-4 sm:right-6',
            'w-[320px] sm:w-[360px]',
            'bg-card border border-border rounded-xl shadow-2xl',
            'cursor-pointer hover:shadow-3xl transition-all duration-300',
            'animate-slide-up'
          )}
        >
          <div className="p-3">
            <div className="flex items-start gap-3">
              <Avatar className="h-9 w-9 shrink-0 mt-0.5">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {getInitials(preview.sender)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-semibold text-foreground truncate">{preview.sender}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">·</span>
                    <span className="text-[10px] text-primary font-medium shrink-0">{preview.deskName}</span>
                  </div>
                  <button
                    onClick={dismissPreview}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{preview.text}</p>
              </div>
            </div>
          </div>
          <div className="h-1 bg-primary/20 rounded-b-xl overflow-hidden">
            <div className="h-full bg-primary animate-shrink-width" />
          </div>
        </div>
      )}

      {/* Floating Bubble */}
      <button
        ref={bubbleRef}
        onClick={handleOpen}
        className={cn(
          'fixed z-50 bottom-4 right-4 sm:right-6',
          'h-14 w-14 rounded-full shadow-lg',
          'flex items-center justify-center',
          'bg-primary text-primary-foreground',
          'hover:scale-105 active:scale-95 transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2'
        )}
        title="Chat de mesas"
        aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageCircle className="h-6 w-6" />
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </>
        )}
      </button>
    </>
  );
}
