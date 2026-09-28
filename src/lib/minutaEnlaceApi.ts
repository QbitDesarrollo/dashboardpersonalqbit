import { llamar } from './minutasApi';

/** What the team does with the client link of a minuta (MINUTAS-ENLACE-PLAN.md). */

export interface Destinatario { nombre: string; email: string }
export interface Contacto extends Destinatario { id: string }
export interface EnvioMinuta { id: string; medio: 'correo' | 'copiado'; para: Destinatario[]; enviado_por: string | null; enviado_en: string }
export interface EstadoEnlace {
  activo: boolean;
  url: string | null;
  codigo: string | null;
  bloqueado_hasta: string | null;
  accesos: { nombre: string; entro_en: string }[];
  envios: EnvioMinuta[];
}
export type MedioEnvio = 'correo' | 'copiado' | 'vista_previa';

const base = (minutaId: string) => `/api/data/minutas/${minutaId}`;

export const leerEnlace = (minutaId: string) => llamar<EstadoEnlace>(`${base(minutaId)}/enlace`);
export const accionEnlace = (minutaId: string, accion: 'activar' | 'apagar' | 'cambiar_codigo') =>
  llamar<EstadoEnlace>(`${base(minutaId)}/enlace`, 'POST', { accion });
export const contactosMinuta = (minutaId: string) => llamar<Contacto[]>(`${base(minutaId)}/contactos`);
export const prepararResumen = async (minutaId: string) => (await llamar<{ resumen: string }>(`${base(minutaId)}/resumen-cliente`, 'POST')).resumen;
export const enviarCliente = (minutaId: string, datos: { medio: MedioEnvio; para: Destinatario[]; resumen: string }) =>
  llamar<{ mensaje: string; enlace?: EstadoEnlace }>(`${base(minutaId)}/enviar-cliente`, 'POST', datos);
