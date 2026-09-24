/**
 * Job: envía avisos por email a responsables de tareas que vencen pronto.
 * Se ejecuta automáticamente cada 24h desde index.ts.
 */
import { query } from '../db/mysql.js';
import { sendEmail, deadlineWarningEmail } from '../services/email.js';

const frontendUrl = process.env.FRONTEND_URL || 'https://tiusdei.qbit.ec';
const DIAS_ANTELACION = 2;

export async function runDeadlineWarning(): Promise<{ enviados: number; total: number }> {
  if (!process.env.SMTP_PASS) {
    console.log('[JOB] Deadline warning: SMTP no configurado, omitiendo');
    return { enviados: 0, total: 0 };
  }
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hasta = new Date(hoy);
    hasta.setDate(hasta.getDate() + DIAS_ANTELACION);
    hasta.setHours(23, 59, 59, 999);
    const hoyStr = hoy.toISOString().slice(0, 10);
    const hastaStr = hasta.toISOString().slice(0, 10);

    const rows = await query<any[]>(
      `SELECT t.id, t.titulo_tarea, t.fecha_entrega, t.prioridad, t.responsable_user_id,
              b.nombre as brand_nombre, p.email as resp_email, p.nombre as resp_nombre
       FROM tasks t
       LEFT JOIN brands b ON b.id = t.brand_id
       LEFT JOIN profiles p ON p.id = t.responsable_user_id
       WHERE t.fecha_entrega BETWEEN ? AND ?
         AND t.responsable_user_id IS NOT NULL
         AND p.email IS NOT NULL AND p.email != ''
         AND t.estado NOT IN ('entregado', 'aprobado', 'revision_cliente', 'revision_interna', 'en_revision')`,
      [hoyStr, hastaStr]
    );

    let enviados = 0;
    for (const row of rows) {
      const diasRestantes = Math.ceil(
        (new Date(row.fecha_entrega).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
      );
      const emailData = await deadlineWarningEmail({
        recipientName: row.resp_nombre || 'Responsable',
        taskTitle: row.titulo_tarea,
        brandName: row.brand_nombre || 'Sin marca',
        fechaEntrega: row.fecha_entrega,
        diasRestantes,
        prioridad: row.prioridad || 'media',
        frontendUrl,
        taskId: row.id,
      });
      emailData.to = row.resp_email;
      const ok = await sendEmail(emailData);
      if (ok) enviados++;
    }
    if (enviados > 0) {
      console.log(`[JOB] Deadline warning: ${enviados}/${rows.length} emails enviados`);
    }
    return { enviados, total: rows.length };
  } catch (err) {
    console.error('[JOB] Error en deadline warning:', err);
    return { enviados: 0, total: 0 };
  }
}
