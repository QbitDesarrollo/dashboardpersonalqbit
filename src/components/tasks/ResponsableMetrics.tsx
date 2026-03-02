import { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';

interface Task {
  id: string;
  responsable_user_id: string | null;
  estado: string;
}

interface ResponsableMetricsProps {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  allTasks: Task[];
  compact?: boolean;
}

export function ResponsableMetrics({ userId, userName, avatarUrl, allTasks, compact = false }: ResponsableMetricsProps) {
  const metrics = useMemo(() => {
    const userTasks = allTasks.filter(t => t.responsable_user_id === userId);
    const total = userTasks.length;
    const completed = userTasks.filter(t => t.estado === 'entregado' || t.estado === 'aprobado').length;
    const inProgress = userTasks.filter(t => t.estado === 'en_proceso' || t.estado === 'en_revision').length;
    const pending = userTasks.filter(t => t.estado === 'backlog' || t.estado === 'bloqueado').length;
    
    return { total, completed, inProgress, pending };
  }, [userId, allTasks]);

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-default">
              <Avatar className="h-5 w-5">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} className="object-cover" /> : null}
                <AvatarFallback className="bg-primary/20 text-primary text-[8px] font-semibold">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium truncate max-w-[120px]">{userName}</span>
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full font-medium">
                {metrics.total}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="p-3">
            <div className="space-y-1.5">
              <p className="font-semibold text-sm">{userName}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-status-delivered" />
                  <span>Completadas: {metrics.completed}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-status-in-progress" />
                  <span>En progreso: {metrics.inProgress}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-status-backlog" />
                  <span>Pendientes: {metrics.pending}</span>
                </div>
                <div className="flex items-center gap-1.5 font-medium">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span>Total: {metrics.total}</span>
                </div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} className="object-cover" /> : null}
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
            {getInitials(userName)}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium">{userName}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-2 p-2 rounded-md bg-status-delivered/10">
          <CheckCircle2 className="h-4 w-4 text-status-delivered" />
          <span>Completadas: <strong>{metrics.completed}</strong></span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-md bg-status-in-progress/10">
          <Clock className="h-4 w-4 text-status-in-progress" />
          <span>En progreso: <strong>{metrics.inProgress}</strong></span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-md bg-status-backlog/10">
          <AlertCircle className="h-4 w-4 text-status-backlog" />
          <span>Pendientes: <strong>{metrics.pending}</strong></span>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10">
          <User className="h-4 w-4 text-primary" />
          <span>Total: <strong>{metrics.total}</strong></span>
        </div>
      </div>
    </div>
  );
}
