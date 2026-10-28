import { estadoReunion, etiquetaRelativa, registrarIngreso, type Reunion } from '@/lib/reuniones';

export function ReunionFlotante({ reunion, now }: { reunion: Reunion; now: number }) {
  const actual = estadoReunion(reunion, now) === 'en_curso';
  return (
    <div className={`my-2 flex items-center justify-between gap-2 border-y py-2 text-xs ${actual ? 'rounded border-primary/40 bg-primary/10 px-2' : ''}`}>
      <span>{reunion.summary} · {actual ? 'En curso' : etiquetaRelativa(reunion.start, now)}</span>
      <a className="shrink-0 rounded border px-2 py-1 focus-visible:ring-2" href={reunion.enlace?.url || reunion.htmlLink} target="_blank" rel="noopener noreferrer"
        onClick={() => { if (reunion.enlace) { try { registrarIngreso(localStorage, reunion, now); } catch { /* Almacenamiento bloqueado. */ } } }}>
        {!reunion.enlace ? 'Ver en Calendar' : actual && reunion.enlace.plataforma === 'meet' ? 'Entrar a Meet' : 'Unirse'}
      </a>
    </div>
  );
}
