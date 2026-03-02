import { useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003');

export interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  comentario: string;
  contenido_html?: string;
  image_url?: string;
  likes_count?: number;
  liked_by_me?: boolean;
  created_at: string;
  user?: { nombre: string; avatar_url?: string | null };
}

export function useCommentsSocket(taskId: string | null, onNewComment: (c: Comment) => void) {
  const socketRef = useRef<ReturnType<typeof import('socket.io-client').io> | null>(null);
  const onNewCommentRef = useRef(onNewComment);
  onNewCommentRef.current = onNewComment;
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!taskId || typeof window === 'undefined') return;

    const token = localStorage.getItem('tiusdei_token');
    if (!token) return;

    let cancelled = false;

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;
      const socket = io(API_URL.replace(/\/$/, ''), {
        auth: { token },
        // Polling primero para internet lento, luego upgrade a websocket
        transports: ['polling', 'websocket'],
        // Reconexión agresiva para internet inestable
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        // Timeouts generosos para internet lento
        timeout: 20000,
        // Ping cada 15s para detectar desconexión rápido
        pingInterval: 15000,
        pingTimeout: 10000,
      });

      socket.on('connect', () => {
        if (!cancelled) {
          connectedRef.current = true;
          socket.emit('comment:join', taskId);
        }
      });

      socket.on('disconnect', () => {
        connectedRef.current = false;
      });

      socket.on('reconnect', () => {
        // Re-join la room al reconectarse
        if (!cancelled) {
          connectedRef.current = true;
          socket.emit('comment:join', taskId);
        }
      });

      socket.on('comment:new', (comment: Comment) => {
        if (!cancelled && comment.task_id === taskId) {
          onNewCommentRef.current(comment);
        }
      });

      socketRef.current = socket;
    }).catch(console.error);

    return () => {
      cancelled = true;
      connectedRef.current = false;
      if (socketRef.current) {
        socketRef.current.emit('comment:leave', taskId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [taskId]); // Solo depende de taskId, no del callback

  const isConnected = useCallback(() => connectedRef.current && !!socketRef.current?.connected, []);

  const emitComment = useCallback((comentario: string, image_url?: string, contenido_html?: string) => {
    if (!taskId || !socketRef.current?.connected) return null;
    return new Promise<void>((resolve, reject) => {
      // Timeout de 8s para internet lento
      const timer = setTimeout(() => reject(new Error('Timeout')), 8000);
      socketRef.current!.emit('comment:new', { taskId, comentario, image_url, contenido_html }, (err?: { message: string }) => {
        clearTimeout(timer);
        if (err) reject(new Error(err.message));
        else resolve();
      });
    });
  }, [taskId]);

  return { emitComment, isConnected };
}
