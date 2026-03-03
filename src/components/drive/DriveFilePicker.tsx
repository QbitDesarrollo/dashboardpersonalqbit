import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DriveBrowser } from './DriveBrowser';
import type { DriveFile } from '@/lib/apiClient';

interface DriveFilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  onAttached?: (file: DriveFile) => void;
}

export function DriveFilePicker({ open, onOpenChange, taskId, onAttached }: DriveFilePickerProps) {
  const handleSelect = (file: DriveFile) => {
    onAttached?.(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[70vh] flex flex-col p-0 gap-0" aria-describedby="drive-picker-desc">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle>Adjuntar archivo de Google Drive</DialogTitle>
          <DialogDescription id="drive-picker-desc">
            Navega o busca archivos en tu Drive y adjúntalos a esta tarea.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <DriveBrowser
            mode="picker"
            taskId={taskId}
            onSelect={handleSelect}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
