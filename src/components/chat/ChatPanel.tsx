import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/apiClient';
import { DeskChat } from './DeskChat';
import { cn } from '@/lib/utils';
import { ArrowLeft, MessageCircle, Users, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { SoundType } from '@/lib/notificationSound';

interface Desk {
  id: string;
  nombre: string;
  activo: boolean;
}

interface Member {
  id: string;
  nombre: string;
  avatar_url?: string | null;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

interface ChatPanelProps {
  soundEnabled?: boolean;
  soundType?: SoundType;
  onUnreadChange?: (total: number) => void;
}

export function ChatPanel({ soundEnabled = true, soundType = 'chime', onUnreadChange }: ChatPanelProps) {
  const { profile, isAdmin, isEjecutivo } = useAuth();
  const [desks, setDesks] = useState<Desk[]>([]);
  const [selectedDesk, setSelectedDesk] = useState<Desk | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [deskMembersMap, setDeskMembersMap] = useState<Record<string, Member[]>>({});
  const [globalPresence, setGlobalPresence] = useState<api.PresenceInfo[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const fetchOnline = useCallback(async () => {
    try {
      const data = await api.getDeskOnlineUsers();
      setGlobalPresence(data.presence || []);
    } catch { /* silent */ }
  }, []);

  const fetchUnread = useCallback(async () => {
    try {
      const data = await api.getDeskUnreadCounts();
      setUnreadCounts(data.counts || {});
      if (onUnreadChange) {
        const total = Object.values(data.counts || {}).reduce((a, b) => a + b, 0);
        onUnreadChange(total);
      }
    } catch { /* silent */ }
  }, [onUnreadChange]);

  useEffect(() => {
    loadDesks();
    fetchOnline();
    fetchUnread();
    const onlineInterval = setInterval(fetchOnline, 15000);
    const unreadInterval = setInterval(fetchUnread, 30000);
    return () => {
      clearInterval(onlineInterval);
      clearInterval(unreadInterval);
    };
  }, [fetchOnline, fetchUnread]);

  useEffect(() => {
    const handler = (e: Event) => {
      const deskName = (e as CustomEvent).detail?.deskName as string;
      if (!deskName) return;
      const match = desks.find(d => d.nombre.toLowerCase() === deskName.toLowerCase());
      if (match) handleSelectDesk(match);
    };
    window.addEventListener('open-desk-chat', handler);
    return () => window.removeEventListener('open-desk-chat', handler);
  }, [desks]);

  const loadDesks = async () => {
    try {
      const allDesks = await api.getDesks();
      if (!Array.isArray(allDesks)) return;
      const active = allDesks.filter((d: Desk) => d.activo);
      const membersMap: Record<string, Member[]> = {};

      if (isAdmin || isEjecutivo) {
        setDesks(active);
        for (const desk of active) {
          try {
            const dm = await api.getDeskMembers(desk.id);
            if (Array.isArray(dm)) {
              membersMap[desk.id] = dm.map((m: any) => ({ id: m.id, nombre: m.nombre, avatar_url: m.avatar_url }));
            }
          } catch { /* ignore */ }
        }
      } else {
        const myDesks: Desk[] = [];
        for (const desk of active) {
          try {
            const deskMembers = await api.getDeskMembers(desk.id);
            if (Array.isArray(deskMembers)) {
              const mapped = deskMembers.map((m: any) => ({ id: m.id, nombre: m.nombre, avatar_url: m.avatar_url }));
              if (deskMembers.some((m: Member) => m.id === profile?.id)) {
                myDesks.push(desk);
                membersMap[desk.id] = mapped;
              }
            }
          } catch { /* ignore */ }
        }
        setDesks(myDesks);
      }
      setDeskMembersMap(membersMap);
    } catch (e) {
      console.error('[ChatPanel] Error loading desks:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDesk = async (desk: Desk) => {
    setSelectedDesk(desk);
    const cached = deskMembersMap[desk.id];
    if (cached) {
      setMembers(cached);
    } else {
      try {
        const deskMembers = await api.getDeskMembers(desk.id);
        if (Array.isArray(deskMembers)) {
          setMembers(deskMembers.map((m: any) => ({ id: m.id, nombre: m.nombre, avatar_url: m.avatar_url })));
        }
      } catch {
        setMembers([]);
      }
    }
  };

  const handleBack = () => {
    setSelectedDesk(null);
    setTimeout(fetchUnread, 500);
  };

  if (selectedDesk) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0 bg-card">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground truncate">{selectedDesk.nombre}</span>
        </div>
        <div className="flex-1 min-h-0">
          <DeskChat
            deskId={selectedDesk.id}
            deskName={selectedDesk.nombre}
            soundEnabled={soundEnabled}
            soundType={soundType}
            members={members}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Chat de Mesas
        </h3>
        <p className="text-xs text-muted-foreground mt-1">Selecciona una mesa para chatear</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : desks.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No perteneces a ninguna mesa</p>
            <p className="text-xs mt-1">Un admin debe agregarte a una mesa para chatear</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {desks.map((desk) => {
              const deskMembers = deskMembersMap[desk.id] || [];
              const activeCount = deskMembers.filter(m => {
                const p = globalPresence.find(gp => gp.userId === m.id);
                return p?.status === 'online';
              }).length;
              const awayCount = deskMembers.filter(m => {
                const p = globalPresence.find(gp => gp.userId === m.id);
                return p?.status === 'away';
              }).length;
              const unread = unreadCounts[desk.id] || 0;
              return (
                <button
                  key={desk.id}
                  onClick={() => handleSelectDesk(desk)}
                  className="w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-center gap-3"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                        {getInitials(desk.nombre)}
                      </AvatarFallback>
                    </Avatar>
                    {unread > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'text-sm font-medium text-foreground truncate',
                        unread > 0 && 'font-bold'
                      )}>{desk.nombre}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {activeCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Circle className="h-2 w-2 fill-green-500 text-green-500 shrink-0" />
                          <span className="text-xs text-green-600 dark:text-green-400">{activeCount} activo{activeCount > 1 ? 's' : ''}</span>
                        </span>
                      )}
                      {awayCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Circle className="h-2 w-2 fill-amber-400 text-amber-400 shrink-0" />
                          <span className="text-xs text-amber-600 dark:text-amber-400">{awayCount} ausente{awayCount > 1 ? 's' : ''}</span>
                        </span>
                      )}
                      {activeCount === 0 && awayCount === 0 && (
                        <span className="text-xs text-muted-foreground">Todos desconectados</span>
                      )}
                      <span className="text-xs text-muted-foreground">· {deskMembers.length} miembros</span>
                    </div>
                  </div>
                  {unread > 0 ? (
                    <MessageCircle className="h-4 w-4 text-primary shrink-0 fill-primary" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
