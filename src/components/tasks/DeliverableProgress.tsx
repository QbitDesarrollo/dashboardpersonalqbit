import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeliverableProgressProps {
  taskId: string;
  expectedCount: number;
  compact?: boolean;
}

export function DeliverableProgress({ taskId, expectedCount, compact = false }: DeliverableProgressProps) {
  const [approvedCount, setApprovedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchDeliverables();
  }, [taskId]);

  const fetchDeliverables = async () => {
    try {
      const { data, error } = await supabase
        .from('deliverables')
        .select('estado')
        .eq('task_id', taskId);

      if (error) throw error;

      setTotalCount(data?.length || 0);
      setApprovedCount(data?.filter(d => d.estado === 'aprobado' || d.estado === 'final').length || 0);
    } catch (error) {
      console.error('Error fetching deliverables:', error);
    }
  };

  const percentage = expectedCount > 0 ? Math.round((approvedCount / expectedCount) * 100) : 0;
  const isComplete = approvedCount >= expectedCount && expectedCount > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn(
          "flex items-center gap-1 text-sm font-medium",
          isComplete ? "text-success" : "text-muted-foreground"
        )}>
          {isComplete ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Package className="h-4 w-4" />
          )}
          <span>{approvedCount}/{expectedCount}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Entregables Aprobados</span>
        <span className={cn(
          "font-medium",
          isComplete ? "text-success" : "text-foreground"
        )}>
          {approvedCount} / {expectedCount}
        </span>
      </div>
      <Progress 
        value={percentage} 
        className={cn(
          "h-2",
          isComplete && "[&>div]:bg-success"
        )}
      />
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {totalCount} entregables creados
        </span>
        {isComplete && (
          <Badge variant="outline" className="text-success border-success gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completado
          </Badge>
        )}
      </div>
    </div>
  );
}
