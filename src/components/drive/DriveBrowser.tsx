import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import * as api from '@/lib/apiClient';
import type { DriveFile } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Folder, FileText, FileSpreadsheet, Image, Film, File, ChevronRight, ArrowLeft, ExternalLink, Plus, Users, Clock, HardDrive } from 'lucide-react';

interface DriveBrowserProps {
  mode?: 'browse' | 'picker';
  taskId?: string;
  onSelect?: (file: DriveFile) => void;
  onClose?: () => void;
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/vnd.google-apps.folder') return <Folder className="h-5 w-5 text-blue-500" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
  if (mimeType.includes('document') || mimeType.includes('word')) return <FileText className="h-5 w-5 text-blue-600" />;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return <FileText className="h-5 w-5 text-yellow-600" />;
  if (mimeType.includes('image')) return <Image className="h-5 w-5 text-purple-500" />;
  if (mimeType.includes('video')) return <Film className="h-5 w-5 text-red-500" />;
  if (mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-red-600" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatSize(bytes: number | null | undefined) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DriveBrowser({ mode = 'browse', taskId, onSelect, onClose }: DriveBrowserProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'Mi Drive' }]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  const currentFolder = folderStack[folderStack.length - 1];

  const loadFiles = useCallback(async (folderId: string, pageToken?: string) => {
    setLoading(true);
    try {
      const data = await api.getDriveFiles(folderId, pageToken);
      if (pageToken) {
        setFiles(prev => [...prev, ...data.files]);
      } else {
        setFiles(data.files);
      }
      setNextPageToken(data.nextPageToken);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('401') || msg.includes('no conectado')) setConnected(false);
      console.error('[DriveBrowser] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.getDriveStatus().then(s => {
      setConnected(s.connected && s.hasDriveScope);
      if (s.connected && s.hasDriveScope) loadFiles('root');
      else setLoading(false);
    }).catch(() => { setLoading(false); setConnected(false); });
  }, [loadFiles]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setLoading(true);
    try {
      const data = await api.searchDriveFiles(searchQuery.trim());
      setFiles(data.files);
      setNextPageToken(null);
    } catch (e) {
      console.error('[DriveBrowser] search error:', e);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    loadFiles(currentFolder.id);
  };

  const navigateToFolder = (file: DriveFile) => {
    setFolderStack(prev => [...prev, { id: file.id, name: file.name }]);
    setSearchQuery('');
    loadFiles(file.id);
  };

  const goBack = () => {
    if (folderStack.length <= 1) return;
    const newStack = folderStack.slice(0, -1);
    setFolderStack(newStack);
    setSearchQuery('');
    loadFiles(newStack[newStack.length - 1].id);
  };

  const goToBreadcrumb = (index: number) => {
    const newStack = folderStack.slice(0, index + 1);
    setFolderStack(newStack);
    setSearchQuery('');
    loadFiles(newStack[newStack.length - 1].id);
  };

  const handleAttach = async (file: DriveFile) => {
    if (!taskId || !onSelect) return;
    setAttaching(file.id);
    try {
      await api.attachDriveFile(taskId, file);
      onSelect(file);
    } catch (e) {
      console.error('[DriveBrowser] attach error:', e);
    } finally {
      setAttaching(null);
    }
  };

  // Prevent any event inside DriveBrowser from submitting parent forms
  const stopFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <Folder className="h-12 w-12 text-muted-foreground/50" />
        <div>
          <p className="font-medium text-foreground">Google Drive no conectado</p>
          <p className="text-sm text-muted-foreground mt-1">
            Reconecta tu cuenta de Google desde tu perfil para acceder a Drive.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" onSubmit={stopFormSubmit}>
      {/* Search */}
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar en Drive..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleSearch(); } }}
              className="pl-9 h-9"
            />
          </div>
          {searchQuery && (
            <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearSearch(); }} className="h-9">
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Quick access + Breadcrumb */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-1 text-sm overflow-x-auto shrink-0">
        {folderStack.length > 1 && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.preventDefault(); e.stopPropagation(); goBack(); }}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        {folderStack.map((folder, i) => (
          <div key={folder.id} className="flex items-center shrink-0">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToBreadcrumb(i); }}
              className={cn(
                'text-xs px-1.5 py-0.5 rounded hover:bg-muted truncate max-w-[120px]',
                i === folderStack.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'
              )}
            >
              {folder.name}
            </button>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant={currentFolder.id === 'root' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 text-[11px] gap-1 px-2"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFolderStack([{ id: 'root', name: 'Mi Drive' }]); setSearchQuery(''); loadFiles('root'); }}
          >
            <HardDrive className="h-3 w-3" />
            Mi Drive
          </Button>
          <Button
            type="button"
            variant={currentFolder.id === 'shared' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 text-[11px] gap-1 px-2"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFolderStack([{ id: 'shared', name: 'Compartidos' }]); setSearchQuery(''); loadFiles('shared'); }}
          >
            <Users className="h-3 w-3" />
            Compartidos
          </Button>
          <Button
            type="button"
            variant={currentFolder.id === 'recent' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 text-[11px] gap-1 px-2"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFolderStack([{ id: 'recent', name: 'Recientes' }]); setSearchQuery(''); loadFiles('recent'); }}
          >
            <Clock className="h-3 w-3" />
            Recientes
          </Button>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && files.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <p>No se encontraron archivos</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {files.map(file => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors',
                  file.isFolder && 'cursor-pointer'
                )}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (file.isFolder) navigateToFolder(file); }}
              >
                {file.iconLink ? (
                  <img src={file.iconLink} alt="" className="h-5 w-5 shrink-0" />
                ) : (
                  getFileIcon(file.mimeType)
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(file.modifiedTime)}
                    {file.size ? ` · ${formatSize(file.size)}` : ''}
                  </p>
                </div>
                {!file.isFolder && (
                  <div className="flex items-center gap-1 shrink-0">
                    {file.webViewLink && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(file.webViewLink, '_blank'); }}
                        title="Abrir en Drive"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {mode === 'picker' && onSelect && (
                      taskId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAttach(file); }}
                          disabled={attaching === file.id}
                        >
                          {attaching === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                          Adjuntar
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(file); }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Seleccionar
                        </Button>
                      )
                    )}
                  </div>
                )}
                {file.isFolder && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {nextPageToken && (
          <div className="flex justify-center py-3">
            <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); loadFiles(currentFolder.id, nextPageToken); }} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Cargar más
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
