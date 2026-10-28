import { describe, expect, it, vi } from 'vitest';
import { crearServicioArchivo, type Ejecutor, type ConTransaccion } from '../src/departamentos/archivo.js';
import * as SQL from '../src/departamentos/consultas.js';

const conexion = vi.hoisted(() => ({ query: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }));
vi.mock('../src/db/mysql.js', () => ({ pool: { getConnection: async () => conexion }, uuid: () => 'uuid', query: vi.fn() }));
const rol = vi.hoisted(() => ({ hasRole: vi.fn() }));
vi.mock('../src/utils/roles.js', () => rol);
import { conTransaccion } from '../src/departamentos/transaccion.js';
import { puedeAdministrarDepartamentos } from '../src/departamentos/permisos.js';

const origen = { id: 'a', nombre: 'Contenido', activo: 1, next_department_id: 'b' };
const destino = { id: 'b', nombre: 'Diseño', activo: 1, next_department_id: null };
function preparar(opciones: { archivado?: boolean; referencia?: string; fallo?: string; inexistente?: boolean } = {}) {
  const llamadas: { sql: string; params: unknown[] }[] = [];
  const eventos: string[] = [];
  let dentro = false;
  const estado = { escrituras: 0 };
  const tx: Ejecutor = { async query<T>(sql: string, params: unknown[] = []) {
    expect(dentro).toBe(true);
    llamadas.push({ sql, params });
    if (sql === opciones.fallo) throw new Error('Fallo simulado');
    let resultado: unknown = { affectedRows: 1 };
    if (sql === SQL.BLOQUEAR_DEPARTAMENTOS) resultado = opciones.inexistente ? [] : [{ ...origen, activo: opciones.archivado ? 0 : 1 }, destino];
    else if (sql === SQL.TAREAS_ABIERTAS) {
      expect(params).toEqual(['a', 'entregado', 'aprobado', 'cancelado']);
      expect(sql).toContain('estado NOT IN (?, ?, ?)');
      resultado = [{ id: 't1', responsable_user_id: 'u1' }, { id: 't2', responsable_user_id: null }];
    } else if (sql === SQL.ETAPAS_ENTRANTES) resultado = [{ id: 'b' }, { id: 'x' }];
    else if (Object.values(SQL.REFERENCIAS).includes(sql)) resultado = sql === SQL.REFERENCIAS[opciones.referencia as keyof typeof SQL.REFERENCIAS] ? [{ id: 'ref' }] : [];
    else estado.escrituras++;
    return resultado as T;
  } };
  const conTransaccion: ConTransaccion = async trabajo => {
    expect(dentro).toBe(false);
    eventos.push('begin'); dentro = true;
    const antes = estado.escrituras;
    try { const resultado = await trabajo(tx); eventos.push('commit'); return resultado; }
    catch (e) { estado.escrituras = antes; eventos.push('rollback'); throw e; }
    finally { dentro = false; }
  };
  return { servicio: crearServicioArchivo(conTransaccion, () => 'uuid'), llamadas, eventos, estado };
}

describe('adaptador MySQL y permisos · S9', () => {
  it('usa solo la conexión adquirida y confirma antes de liberarla', async () => {
    vi.clearAllMocks();
    const orden: string[] = [];
    conexion.query.mockImplementation(async (sql: string) => { orden.push(sql); return [[{ id: 'a' }], []]; });
    conexion.beginTransaction.mockImplementation(async () => { orden.push('begin'); });
    conexion.commit.mockImplementation(async () => { orden.push('commit'); });
    conexion.release.mockImplementation(() => { orden.push('release'); });
    expect(await conTransaccion(tx => tx.query('SELECT de prueba', ['a']))).toEqual([{ id: 'a' }]);
    expect(conexion.query).toHaveBeenCalledWith('SELECT de prueba', ['a']);
    expect(orden).toEqual([SQL.AISLAMIENTO, 'begin', 'SELECT de prueba', 'commit', 'release']);
    expect(conexion.rollback).not.toHaveBeenCalled();
  });
  it('revierte y libera en fallos SQL, sin commit ni supresión del error', async () => {
    vi.clearAllMocks();
    const orden: string[] = [];
    conexion.query.mockImplementation(async (sql: string) => {
      orden.push(sql);
      if (sql === 'UPDATE de prueba') throw new Error('SQL falló');
      return [[], []];
    });
    conexion.beginTransaction.mockImplementation(async () => { orden.push('begin'); });
    conexion.rollback.mockImplementation(async () => { orden.push('rollback'); });
    conexion.release.mockImplementation(() => { orden.push('release'); });
    await expect(conTransaccion(tx => tx.query('UPDATE de prueba'))).rejects.toThrow('SQL falló');
    expect(orden).toEqual([SQL.AISLAMIENTO, 'begin', 'UPDATE de prueba', 'rollback', 'release']);
    expect(conexion.commit).not.toHaveBeenCalled();
  });
  it('solo solicita el rol admin, nunca ejecutivo', async () => {
    rol.hasRole.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await puedeAdministrarDepartamentos('ejecutivo')).toBe(false);
    expect(await puedeAdministrarDepartamentos('administrador')).toBe(true);
    expect(rol.hasRole).toHaveBeenCalledWith('ejecutivo', ['admin']);
    expect(rol.hasRole).toHaveBeenCalledWith('administrador', ['admin']);
  });
});

describe('archivo transaccional · S9', () => {
  it('mueve solo abiertas, cierra y abre historial, mueve personas/mesas, reencadena y archiva en orden', async () => {
    const f = preparar();
    expect(await f.servicio.archivar('a', 'b')).toEqual({ tareas: 2, personas: 1, mesas: 1, etapas: 2 });
    expect(f.eventos).toEqual(['begin', 'commit']);
    expect(f.llamadas.map(c => c.sql)).toEqual([
      SQL.BLOQUEAR_DEPARTAMENTOS, SQL.TAREAS_ABIERTAS,
      SQL.MOVER_TAREA, SQL.CERRAR_HISTORIAL, SQL.ABRIR_HISTORIAL,
      SQL.MOVER_TAREA, SQL.CERRAR_HISTORIAL, SQL.ABRIR_HISTORIAL,
      SQL.MOVER_PERSONAS, SQL.MOVER_MESAS, SQL.ETAPAS_ENTRANTES,
      SQL.REENCADENAR_ETAPA, SQL.REENCADENAR_ETAPA, SQL.ARCHIVAR,
    ]);
    expect(f.llamadas.filter(c => c.sql === SQL.ABRIR_HISTORIAL).map(c => c.params)).toEqual([['uuid', 't1', 'b', 'u1'], ['uuid', 't2', 'b', null]]);
    expect(f.llamadas.filter(c => c.sql === SQL.REENCADENAR_ETAPA).map(c => c.params)).toEqual([[null, 'b'], ['b', 'x']]);
    for (const sql of [SQL.MOVER_PERSONAS, SQL.MOVER_MESAS]) expect(f.llamadas.find(c => c.sql === sql)?.params).toEqual(['b', 'a']);
    expect(f.llamadas.at(-1)?.params).toEqual(['a']);
  });
  it('sin destino cierra historial sin inventar un departamento y conserva responsables', async () => {
    const f = preparar(); await f.servicio.archivar('a', null);
    expect(f.llamadas.filter(c => c.sql === SQL.MOVER_TAREA).map(c => c.params)).toEqual([[null, 't1'], [null, 't2']]);
    expect(f.llamadas.filter(c => c.sql === SQL.CERRAR_HISTORIAL).map(c => c.params)).toEqual([['t1'], ['t2']]);
    expect(f.llamadas.some(c => c.sql === SQL.ABRIR_HISTORIAL)).toBe(false);
  });
  it('propaga el error y hace rollback de todas las escrituras si falla a mitad', async () => {
    const f = preparar({ fallo: SQL.MOVER_MESAS });
    await expect(f.servicio.archivar('a', 'b')).rejects.toThrow('Fallo simulado');
    expect(f.eventos).toEqual(['begin', 'rollback']);
    expect(f.estado.escrituras).toBe(0);
    expect(f.llamadas.some(c => c.sql === SQL.ARCHIVAR)).toBe(false);
  });
  for (const referencia of ['tareas', 'historial', 'traspasos', 'plantillas', 'personas', 'mesas', 'etapas']) it(`no elimina cuando hay ${referencia}`, async () => {
    const f = preparar({ archivado: true, referencia });
    await expect(f.servicio.eliminar('a', 'Contenido')).rejects.toMatchObject({ status: 409, referencias: expect.objectContaining({ [referencia]: 1 }) });
    expect(f.eventos).toEqual(['begin', 'rollback']);
    expect(f.estado.escrituras).toBe(0);
    expect(f.llamadas.some(c => c.sql === SQL.ELIMINAR)).toBe(false);
  });
  it('elimina un archivado sin referencias solo después de comprobar todas en la misma transacción', async () => {
    const f = preparar({ archivado: true });
    expect(await f.servicio.eliminar('a', 'Contenido')).toEqual({ ok: true });
    expect(f.llamadas.map(c => c.sql)).toEqual([SQL.BLOQUEAR_DEPARTAMENTOS, ...Object.values(SQL.REFERENCIAS), SQL.ELIMINAR]);
    expect(f.llamadas.at(-1)?.params).toEqual(['a']);
    expect(f.eventos).toEqual(['begin', 'commit']);
  });
  it('rechaza activos, inexistentes y confirmación incorrecta sin escrituras', async () => {
    for (const opciones of [{}, { inexistente: true }, { archivado: true }]) {
      const f = preparar(opciones);
      await expect(f.servicio.eliminar('a', 'contenido')).rejects.toBeInstanceOf(Error);
      expect(f.estado.escrituras).toBe(0);
      expect(f.eventos).toEqual(['begin', 'rollback']);
    }
  });
  it('restaura sin devolver tareas/personas/mesas y comprueba existencia', async () => {
    const f = preparar({ archivado: true });
    expect(await f.servicio.restaurar('a')).toEqual({ ok: true });
    expect(f.llamadas.map(c => c.sql)).toEqual([SQL.BLOQUEAR_DEPARTAMENTOS, SQL.RESTAURAR]);
    expect(f.eventos).toEqual(['begin', 'commit']);
    const ausente = preparar({ inexistente: true });
    await expect(ausente.servicio.restaurar('a')).rejects.toMatchObject({ status: 404 });
    expect(ausente.estado.escrituras).toBe(0);
  });
  it('la consulta de referencias es de solo lectura y devuelve todos los conteos', async () => {
    const f = preparar({ archivado: true, referencia: 'historial' });
    expect(await f.servicio.referencias('a')).toEqual({ tareas: 0, historial: 1, traspasos: 0, plantillas: 0, personas: 0, mesas: 0, etapas: 0 });
    expect(f.estado.escrituras).toBe(0);
    expect(f.eventos).toEqual(['begin', 'commit']);
  });
});
