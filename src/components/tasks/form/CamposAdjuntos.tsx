import { useState } from 'react';
import { FolderOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/RichTextEditor';
import { DriveBrowser } from '@/components/drive/DriveBrowser';
import { CustomFieldsForm } from '@/components/tasks/CustomFieldsForm';
import { FileUploader } from '@/components/tasks/FileUploader';
import { TaskFiles } from '@/components/tasks/TaskFiles';
import type { TareaFormState } from './useTareaForm';

interface Props {
  form: TareaFormState;
  /** Existing task: its files are managed directly. New task: attachments wait until it is created. */
  taskId?: string;
  puedeEditarArchivos: boolean;
}

/** Detail, links, custom fields and files. */
export function CamposAdjuntos({ form, taskId, puedeEditarArchivos }: Props) {
  const { valores, cambiar, archivos, setArchivos, archivosDrive, setArchivosDrive, camposPersonalizados, setCamposPersonalizados } = form;
  const [drivePicker, setDrivePicker] = useState(false);

  return (
    <>
      <div className="col-span-1 sm:col-span-2 space-y-2">
        <Label htmlFor="detalle">Detalle</Label>
        <RichTextEditor
          content={valores.detalle}
          onChange={(html) => cambiar({ detalle: html })}
          placeholder="Escribe el detalle de la tarea... Usa encabezados, listas, checklists, etc."
          minHeight="120px"
        />
      </div>

      <div className="col-span-1 sm:col-span-2 space-y-2">
        <Label htmlFor="enlaces">Enlaces (uno por línea)</Label>
        <Textarea id="enlaces" value={valores.enlaces} onChange={(e) => cambiar({ enlaces: e.target.value })} rows={2} placeholder="https://..." />
      </div>

      <div className="col-span-1 sm:col-span-2">
        <CustomFieldsForm
          taskId={taskId}
          brandId={valores.brand_id}
          values={camposPersonalizados}
          onChange={(fieldId, value) => setCamposPersonalizados((prev) => ({ ...prev, [fieldId]: value }))}
        />
      </div>

      <div className="col-span-1 sm:col-span-2">
        {taskId ? (
          <TaskFiles taskId={taskId} canEdit={puedeEditarArchivos} />
        ) : (
          <div className="space-y-3">
            <FileUploader taskId={null} files={archivos} onFilesChange={setArchivos} canEdit />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4" />
                  Google Drive
                  {archivosDrive.length > 0 && (
                    <span className="text-xs bg-blue-500/10 text-blue-600 rounded-full px-1.5">{archivosDrive.length}</span>
                  )}
                </h4>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setDrivePicker(!drivePicker)}>
                  <FolderOpen className="h-3 w-3" />
                  {drivePicker ? 'Cerrar' : 'Drive'}
                </Button>
              </div>

              {archivosDrive.length > 0 && (
                <div className="space-y-1">
                  {archivosDrive.map((df) => (
                    <div key={df.id} className="flex items-center gap-2 p-2 rounded-md bg-blue-50 dark:bg-blue-500/10 group text-sm">
                      {df.iconLink && <img src={df.iconLink} alt="" className="h-4 w-4" />}
                      <span className="text-xs truncate flex-1">{df.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar ${df.name}`}
                        className="h-6 w-6 shrink-0"
                        onClick={() => setArchivosDrive((prev) => prev.filter((f) => f.id !== df.id))}
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Wrapped so the picker never submits the task form. */}
              {drivePicker && (
                <div
                  className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto"
                  onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}
                >
                  <DriveBrowser
                    mode="picker"
                    onSelect={(file) => setArchivosDrive((prev) => (prev.some((f) => f.id === file.id) ? prev : [...prev, file]))}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
