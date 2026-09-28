import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorEnlace, entrarCodigo, entrarNombre } from '@/lib/minutaPublicaApi';

interface Props {
  token: string;
  /** Name remembered from a previous visit, to preselect it. */
  nombreInicial: string | null;
  onEntrar: (sesion: string, nombre: string) => void;
  onNoDisponible: () => void;
}

const OTRA = '__otra__';

/** Entry to the client link: first the code, then who is entering, picked from the people it was sent to. */
export function EntradaCliente({ token, nombreInicial, onEntrar, onNoDisponible }: Props) {
  const [codigo, setCodigo] = useState('');
  const [datos, setDatos] = useState<{ titulo: string; marca: string; nombres: string[] } | null>(null);
  const [elegido, setElegido] = useState('');
  const [otro, setOtro] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const fallo = (e: unknown) => {
    if (e instanceof ErrorEnlace && e.status === 404) return onNoDisponible();
    setError(e instanceof Error ? e.message : 'Algo falló. Intenta de nuevo.');
  };

  const validarCodigo = async (ev: FormEvent) => {
    ev.preventDefault();
    setOcupado(true); setError(null);
    try {
      const d = await entrarCodigo(token, codigo.trim());
      setDatos(d);
      const recordado = nombreInicial?.trim() ?? '';
      if (recordado && d.nombres.includes(recordado)) setElegido(recordado);
      else if (recordado) { setElegido(OTRA); setOtro(recordado); }
      else if (d.nombres.length === 0) setElegido(OTRA);
    } catch (e) { fallo(e); } finally { setOcupado(false); }
  };

  const nombre = elegido === OTRA ? otro.trim() : elegido;
  const entrar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!nombre) return;
    setOcupado(true); setError(null);
    try { onEntrar(await entrarNombre(token, codigo.trim(), nombre), nombre); } catch (e) { fallo(e); } finally { setOcupado(false); }
  };

  return (
    <div className="grid min-h-[100svh] place-items-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center">
          <div className="gradient-primary mx-auto grid h-11 w-11 place-items-center rounded-xl text-white"><KeyRound className="h-5 w-5" /></div>
          <p className="pt-2 text-xs uppercase tracking-wider text-muted-foreground">{datos ? datos.marca : 'Minuta de reunión · Qbit'}</p>
          <h1 className="text-lg font-semibold">{datos ? datos.titulo : 'Ingresa tu código de acceso'}</h1>
        </div>

        {!datos ? (
          <form onSubmit={validarCodigo} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="me-codigo">Código de acceso</Label>
              <Input
                id="me-codigo" autoFocus autoComplete="off" maxLength={12} className="text-center font-mono text-lg uppercase tracking-[0.3em]"
                value={codigo} onChange={(e) => setCodigo(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Viene en el mensaje con el que te enviamos la minuta.</p>
            </div>
            <Button type="submit" className="w-full" disabled={ocupado || !codigo.trim()}>{ocupado && <Loader2 className="h-4 w-4 animate-spin" />}Continuar</Button>
          </form>
        ) : (
          <form onSubmit={entrar} className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="pb-1 text-sm font-medium">¿Quién eres?</legend>
              {[...datos.nombres, OTRA].map((n) => (
                <label key={n} className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" name="me-nombre" value={n} checked={elegido === n} onChange={() => setElegido(n)} className="accent-primary" />
                  {n === OTRA ? 'Otra persona' : n}
                </label>
              ))}
            </fieldset>
            {elegido === OTRA && (
              <div className="space-y-1.5">
                <Label htmlFor="me-otro">Tu nombre</Label>
                <Input id="me-otro" maxLength={120} value={otro} onChange={(e) => setOtro(e.target.value)} autoFocus />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={ocupado || !nombre}>{ocupado && <Loader2 className="h-4 w-4 animate-spin" />}Entrar</Button>
          </form>
        )}
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
