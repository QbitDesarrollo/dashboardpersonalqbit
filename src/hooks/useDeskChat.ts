import { useEffect, useRef, useState, useCallback } from 'react';
import * as api from '@/lib/apiClient';
import { playNotificationSound, type SoundType, SOUND_TYPES } from '@/lib/notificationSound';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003');

export interface ChatReaction {
  emoji: string;
  user_id: string;
  nombre: string;
}

export interface ChatMessage {
  id: string;
  desk_id: string;
  user_id: string;
  mensaje: string;
  image_url?: string | null;
  created_at: string;
  user: { nombre: string; avatar_url: string | null };
  read_by: { user_id: string; nombre: string; read_at: string }[];
  reactions: ChatReaction[];
}

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface MemberPresence {
  userId: string;
  status: PresenceStatus;
}

interface UseDeskChatOptions {
  deskId: string | null;
  currentUserId: string | null;
  soundEnabled?: boolean;
  soundType?: SoundType;
}

export function useDeskChat({ deskId, currentUserId, soundEnabled = true, soundType = 'chime' }: UseDeskChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [memberPresence, setMemberPresence] = useState<MemberPresence[]>([]);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<ReturnType<typeof import('socket.io-client').io> | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const soundTypeRef = useRef(soundType);
  soundEnabledRef.current = soundEnabled;
  soundTypeRef.current = soundType;

  // Load initial messages
  const loadMessages = useCallback(async () => {
    if (!deskId) return;
    setLoading(true);
    try {
      const data = await api.getDeskMessages(deskId, { limit: 50 });
      setMessages(data.messages);
      setHasMore(data.has_more);
    } catch (e) {
      console.error('[DeskChat] Error loading messages:', e);
    } finally {
      setLoading(false);
    }
  }, [deskId]);

  // Load older messages (pagination)
  const loadMore = useCallback(async () => {
    if (!deskId || !hasMore || loading) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoading(true);
    try {
      const data = await api.getDeskMessages(deskId, { limit: 50, before: oldest.created_at });
      setMessages(prev => [...data.messages, ...prev]);
      setHasMore(data.has_more);
    } catch (e) {
      console.error('[DeskChat] Error loading more:', e);
    } finally {
      setLoading(false);
    }
  }, [deskId, hasMore, loading, messages]);

  // Socket connection
  useEffect(() => {
    if (!deskId || typeof window === 'undefined') return;

    const token = localStorage.getItem('tiusdei_token');
    if (!token) return;

    let cancelled = false;

    // Load initial messages
    loadMessages();

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;
      const socket = io(API_URL.replace(/\/$/, ''), {
        auth: { token },
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
      });

      socket.on('connect', () => {
        if (!cancelled) {
          setConnected(true);
          socket.emit('desk:join', deskId);
        }
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socket.on('reconnect', () => {
        if (!cancelled) {
          setConnected(true);
          socket.emit('desk:join', deskId);
        }
      });

      socket.on('desk:message:new', (msg: ChatMessage) => {
        if (!cancelled && msg.desk_id === deskId) {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, { ...msg, read_by: msg.read_by || [], reactions: msg.reactions || [] }];
          });
          // Play sound for messages from others
          if (msg.user_id !== currentUserId && soundEnabledRef.current) {
            playNotificationSound(soundTypeRef.current);
          }
        }
      });

      socket.on('desk:online', (data: { deskId: string; users: string[] }) => {
        if (!cancelled && data.deskId === deskId) {
          setOnlineUsers(data.users);
        }
      });

      socket.on('desk:presence', (data: { deskId: string; presence: MemberPresence[] }) => {
        if (!cancelled && data.deskId === deskId) {
          setMemberPresence(data.presence);
        }
      });

      socket.on('desk:read:update', (data: { deskId: string; userId: string; messageIds: string[] }) => {
        if (!cancelled && data.deskId === deskId) {
          setMessages(prev => prev.map(m => {
            if (data.messageIds.includes(m.id) && !m.read_by.some(r => r.user_id === data.userId)) {
              return {
                ...m,
                read_by: [...m.read_by, { user_id: data.userId, nombre: '', read_at: new Date().toISOString() }],
              };
            }
            return m;
          }));
        }
      });

      socket.on('desk:reaction:update', (data: { deskId: string; messageId: string; reactions: ChatReaction[] }) => {
        if (!cancelled && data.deskId === deskId) {
          setMessages(prev => prev.map(m =>
            m.id === data.messageId ? { ...m, reactions: data.reactions } : m
          ));
        }
      });

      socketRef.current = socket;
    }).catch(console.error);

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.emit('desk:leave', deskId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setMessages([]);
      setOnlineUsers([]);
      setMemberPresence([]);
      setConnected(false);
    };
  }, [deskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback((text: string, image_url?: string) => {
    if (!deskId || !socketRef.current?.connected || (!text.trim() && !image_url)) return null;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), 8000);
      socketRef.current!.emit('desk:message', { deskId, mensaje: text.trim(), image_url }, (err?: { message: string }) => {
        clearTimeout(timer);
        if (err) reject(new Error(err.message));
        else resolve();
      });
    });
  }, [deskId]);

  const markAsRead = useCallback((messageIds: string[]) => {
    if (!deskId || !socketRef.current?.connected || messageIds.length === 0) return;
    socketRef.current.emit('desk:read', { deskId, messageIds });
  }, [deskId]);

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    if (!deskId || !socketRef.current?.connected) return;
    socketRef.current.emit('desk:reaction:toggle', { deskId, messageId, emoji });
  }, [deskId]);

  return { messages, loading, hasMore, loadMore, onlineUsers, memberPresence, connected, sendMessage, markAsRead, toggleReaction };
}
