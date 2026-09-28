import { useEffect, useState } from 'react';
import { Copy, Loader2, Mail, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { contactosMinuta, enviarCliente, prepararResumen, type Destinatario, type MedioEnvio } from '@/lib/minutaEnlaceApi';

interface Props {
  minutaId: string;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  /** Something went out (email or copied message): the link card reloads. */
  onEnviado: () => void;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clave = (p: Destinatario) => p.email.toLowerCase();

/** Send a minuta to the client: pick people, let Codex draft the summary, check the message, email it or copy it. */
export function EnviarAlClienteDialog({ minutaId, abierto, onOpenChange, onEnviado }: Props) {
  const [personas, setPersonas] = useState<Destinatario[]>([]);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [nuevo, setNuevo] = useState({ nombre: '', email: '' });
  const [resumen, setResumen] = useState('');
  const [vista, setVista] = useState('');
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState<MedioEnvio | null>(null);

  useEffect(() => {
    if (!abierto) return;
    contactosMinuta(minutaId).then((c) => setPersonas(c.map(({ nombre, email }) => ({ nombre, email })))).catch(() => setPersonas([]));
  }, [abierto, minutaId]);

  const para = personas.filter((p) => elegidos.has(clave(p)));
  const claveVista = JSON.stringify([para, resumen]);

  // The preview is the server's own text, so what you read is exactly what goes out.
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    const t = setTimeout(() => {
      enviarCliente(minutaId, { medio: 'vista_previa', para, resumen }).then((r) => { if (vigente) setVista(r.mensaje); }).catch(() => {});
    }, 300);
    return () => { vigente = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- claveVista stands for para and resumen
  }, [abierto, minutaId, claveVista]);

  const alternar = (p: Destinatario) => setElegidos((s) => { const n = new Set(s); if (n.has(clave(p))) n.delete(clave(p)); else n.add(clave(p)); return n; });
  const valido = nuevo.nombre.trim() && CORREO.test(nuevo.email.trim());
  const agregar = () => {
    const p = { nombre: nuevo.nombre.trim(), email: nuevo.email.trim() };
    setPersonas((ps) => [...ps.filter((x) => clave(x) !== clave(p)), p]);
    setElegidos((s) => new Set(s).add(clave(p)));
    setNuevo({ nombre: '', email: '' });
  };

  const preparar = async () => {
    setPreparando(true);
    try { setResumen(await prepararResumen(minutaId)); } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo preparar el resumen'); } finally { setPreparando(false); }
  };

  const mandar = async (medio: 'correo' | 'copiado') => {
    setEnviando(medio);
    try {
      const r = await enviarCliente(minutaId, { medio, para, resumen });
      if (medio === 'copiado') {
        await navigator.clipboard.writeText(r.mensaje);
        toast.success('Mensaje copiado. Pégalo donde quieras.');
      } else {
        toast.success(`Minuta enviada a ${para.length} ${para.length === 1 ? 'persona' : 'personas'}`);
      }
      onEnviado();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-2xl grid-cols-[minmax(0,1fr)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar al cliente</DialogTitle>
          <DialogDescription>El cliente entra con el enlace y el código, ve los puntos visibles y puede aprobar, pedir ajustes o comentar.</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <p className="text-sm font-medium">Para</p>
          {personas.length === 0 && <p className="text-xs text-muted-foreground">Todavía no hay contactos de esta marca. Agrégalos abajo.</p>}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {personas.map((p) => (
              <label key={clave(p)} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="checkbox" checked={elegidos.has(clave(p))} onChange={() => alternar(p)} aria-label={`${p.nombre} (${p.email})`} className="accent-primary" />
                <span className="min-w-0 truncate">{p.nombre} <span className="text-muted-foreground">· {p.email}</span></span>
              </label>
            ))}
          </div>
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1"><Label htmlFor="ec-nombre" className="text-xs">Nombre</Label><Input id="ec-nombre" maxLength={120} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="ec-email" className="text-xs">Correo</Label><Input id="ec-email" type="email" maxLength={255} value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></div>
            <Button variant="outline" disabled={!valido} onClick={agregar}><Plus className="h-4 w-4" />Agregar</Button>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ec-resumen">Resumen para el cliente</Label>
            <Button variant="outline" size="sm" disabled={preparando} onClick={preparar}>
              {preparando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Preparar resumen
            </Button>
          </div>
          <Textarea id="ec-resumen" rows={3} maxLength={3000} value={resumen} onChange={(e) => setResumen(e.target.value)}
            placeholder={preparando ? 'Dame un momento, estoy redactando el resumen…' : 'Escríbelo tú o usa "Preparar resumen".'} />
        </section>

        <section className="space-y-1.5">
          <p className="text-sm font-medium">Así sale el mensaje</p>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-sans text-sm">{vista}</pre>
        </section>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={!!enviando} onClick={() => mandar('copiado')}>
            {enviando === 'copiado' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}Copiar mensaje
          </Button>
          <Button disabled={!!enviando || para.length === 0} onClick={() => mandar('correo')}>
            {enviando === 'correo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Enviar por correo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
