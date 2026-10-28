export interface PersonaDia {
  id: string | undefined;
  nombre: string;
  esPropia: boolean;
}

export function personaDashboard(
  filtro: string,
  propia: { id: string; nombre: string } | null | undefined,
  personas: { id: string; nombre: string }[],
  puedeFiltrar: boolean,
): PersonaDia {
  const elegida = puedeFiltrar && filtro !== 'all' ? personas.find(p => p.id === filtro) : propia;
  return { id: elegida?.id ?? propia?.id, nombre: elegida?.nombre ?? propia?.nombre ?? '', esPropia: !elegida || elegida.id === propia?.id };
}

export const indicacionPersona = ' · elige una persona en el filtro para ver la suya';
