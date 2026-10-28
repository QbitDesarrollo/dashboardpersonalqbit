import { pool, uuid } from '../db/mysql.js';
import { crearServicioArchivo, type ConTransaccion } from './archivo.js';
import { AISLAMIENTO } from './consultas.js';

/** Una conexión dedicada; ninguna consulta de una mutación sale al pool global. */
export const conTransaccion: ConTransaccion = async trabajo => {
  if (!pool) throw new Error('Base de datos no configurada');
  const conexion = await pool.getConnection();
  try {
    await conexion.query(AISLAMIENTO);
    await conexion.beginTransaction();
    try {
      const resultado = await trabajo({
        async query<T>(sql: string, params: unknown[] = []) {
          const [filas] = await conexion.query(sql, params);
          return filas as T;
        },
      });
      await conexion.commit();
      return resultado;
    } catch (error) {
      await conexion.rollback();
      throw error;
    }
  } finally {
    conexion.release();
  }
};

export const servicioArchivo = crearServicioArchivo(conTransaccion, uuid);
