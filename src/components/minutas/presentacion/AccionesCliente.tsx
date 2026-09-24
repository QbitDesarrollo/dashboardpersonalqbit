import { useState } from 'react';
import { CheckCircle2, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { agregarNota, type Minuta, type Punto } from '@/lib/minutasApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePuntoAcciones } from '../usePuntoAcciones';

interface Props {
  punto: Punto;
  onActualizada: (minuta: Minuta) => void;
}

/** What the client decides about a point during the presentation. The text box opens above the bar. */
export function AccionesCliente({ punto, onActualizada }: Props) {
  const { enviando, conError, accion } = usePuntoAcciones(punto.id, onActualizada);
  const [abierto, setAbierto] = useState<'ajuste' | 'nota' | null>(null);
  const [texto, setTexto] = useState('');
  const listo = punto.estado === 'completado' && !punto.responsable_cliente;

  const abrir = (que: 'ajuste' | 'nota') => { setAbierto(que); setTexto(''); };
  const enviar = async () => {
    const ok = abierto === 'ajuste'
      ? await accion('pedir_ajuste', { motivo: texto.trim() })
      : await conError(() => agregarNota(punto.id, texto.trim()), 'No se pudo guardar la nota');
    if (ok) setAbierto(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {listo && (
          <>
            <Button disabled={enviando} onClick={() => accion('aprobar')}>
              <CheckCircle2 className="h-4 w-4" />Aprobar
            </Button>
            <Button variant="outline" disabled={enviando} onClick={() => abrir('ajuste')}>
              <RotateCcw className="h-4 w-4" />Pedir ajuste
            </Button>
          </>
        )}
        <Button variant="outline" disabled={enviando} onClick={() => abrir('nota')}>
          <MessageSquarePlus className="h-4 w-4" />Agregar nota
        </Button>
      </div>
      {abierto && (
        <div className="absolute inset-x-0 bottom-full mb-3 space-y-3 rounded-2xl border bg-card p-4 shadow-xl">
          <Label htmlFor="pp-texto" className="text-base">{abierto === 'ajuste' ? '¿Qué ajuste pide el cliente?' : 'Nota del cliente'}</Label>
          <Textarea id="pp-texto" rows={3} className="text-lg" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAbierto(null)}>Cancelar</Button>
            <Button disabled={!texto.trim() || enviando} onClick={enviar}>{abierto === 'ajuste' ? 'Enviar ajuste' : 'Guardar nota'}</Button>
          </div>
        </div>
      )}
    </>
  );
}
