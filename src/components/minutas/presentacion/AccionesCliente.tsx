import { useState } from 'react';
import { CheckCircle2, MessageSquarePlus, RotateCcw } from 'lucide-react';
import type { PuntoVista } from '@/lib/minutasApi';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AccionesPresentacion, ModoPresentacion } from './acciones';

interface Props {
  punto: PuntoVista;
  acciones: AccionesPresentacion;
  modo: ModoPresentacion;
}

const TEXTOS: Record<ModoPresentacion, { nota: string; pregunta: { ajuste: string; nota: string }; guardar: { ajuste: string; nota: string } }> = {
  reunion: {
    nota: 'Agregar nota',
    pregunta: { ajuste: '¿Qué ajuste pide el cliente?', nota: 'Nota del cliente' },
    guardar: { ajuste: 'Enviar ajuste', nota: 'Guardar nota' },
  },
  cliente: {
    nota: 'Comentar',
    pregunta: { ajuste: '¿Qué ajuste necesitas?', nota: 'Tu comentario' },
    guardar: { ajuste: 'Enviar ajuste', nota: 'Enviar comentario' },
  },
};

/** What the client decides about a point during the presentation. The text box opens above the bar. */
export function AccionesCliente({ punto, acciones, modo }: Props) {
  const [abierto, setAbierto] = useState<'ajuste' | 'nota' | null>(null);
  const [texto, setTexto] = useState('');
  const listo = punto.estado === 'completado' && !punto.responsable_cliente;
  const t = TEXTOS[modo];

  const abrir = (que: 'ajuste' | 'nota') => { setAbierto(que); setTexto(''); };
  const enviar = async () => {
    const ok = abierto === 'ajuste'
      ? await acciones.pedirAjuste(punto.id, texto.trim())
      : await acciones.comentar(punto.id, texto.trim());
    if (ok) setAbierto(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {listo && (
          <>
            <Button disabled={acciones.enviando} onClick={() => acciones.aprobar(punto.id)}>
              <CheckCircle2 className="h-4 w-4" />Aprobar
            </Button>
            <Button variant="outline" disabled={acciones.enviando} onClick={() => abrir('ajuste')}>
              <RotateCcw className="h-4 w-4" />Pedir ajuste
            </Button>
          </>
        )}
        <Button variant="outline" disabled={acciones.enviando} onClick={() => abrir('nota')}>
          <MessageSquarePlus className="h-4 w-4" />{t.nota}
        </Button>
      </div>
      {abierto && (
        <div className="absolute inset-x-0 bottom-full mb-3 space-y-3 rounded-2xl border bg-card p-4 shadow-xl">
          <Label htmlFor="pp-texto" className="text-base">{t.pregunta[abierto]}</Label>
          <Textarea id="pp-texto" rows={3} className="text-lg" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAbierto(null)}>Cancelar</Button>
            <Button disabled={!texto.trim() || acciones.enviando} onClick={enviar}>{t.guardar[abierto]}</Button>
          </div>
        </div>
      )}
    </>
  );
}
