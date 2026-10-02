/** Loads every authorized page, without changing the API's 500-row limit or its permissions. */
export async function cargarTareasDashboard<T extends { id: string }>(
  pedir: (opciones: { limit: number; offset: number }) => Promise<{ tasks: T[]; total: number }>,
  vigente: () => boolean = () => true,
): Promise<T[]> {
  const tareas = new Map<string, T>();
  let offset = 0;
  while (vigente()) {
    const pagina = await pedir({ limit: 500, offset });
    if (!vigente()) throw new DOMException('Carga cancelada', 'AbortError');
    for (const t of pagina.tasks) tareas.set(t.id, t);
    offset += pagina.tasks.length;
    if (offset >= pagina.total) {
      if (tareas.size < pagina.total) throw new Error('No se pudieron cargar todas las tareas. Intenta de nuevo.');
      return [...tareas.values()];
    }
    if (!pagina.tasks.length) throw new Error('No se pudieron cargar todas las tareas. Intenta de nuevo.');
  }
  throw new DOMException('Carga cancelada', 'AbortError');
}
