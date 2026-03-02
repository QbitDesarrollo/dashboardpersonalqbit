import { query, uuid } from '../db/mysql.js';

export async function logActivity(
  entityType: string,
  entityId: string,
  action: string,
  fieldName: string | null,
  oldValue: string | null,
  newValue: string | null,
  userId: string | null
): Promise<void> {
  try {
    await query(
      `INSERT INTO activity_log (id, entity_type, entity_id, action, field_name, old_value, new_value, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), entityType, entityId, action, fieldName, oldValue, newValue, userId]
    );
  } catch (e) {
    console.error('[ACTIVITY LOG]', e);
  }
}

export async function logTaskChanges(
  taskId: string,
  oldRow: Record<string, any>,
  newData: Record<string, any>,
  userId: string
): Promise<void> {
  for (const [key, newVal] of Object.entries(newData)) {
    if (newVal === undefined) continue;
    const oldVal = oldRow[key];
    const oldStr = oldVal == null ? null : String(oldVal);
    const newStr = newVal == null ? null : String(newVal);
    if (oldStr === newStr) continue;

    const action = key === 'estado' ? 'status_change'
      : key === 'responsable_user_id' ? 'assign'
      : 'update';

    await logActivity('task', taskId, action, key, oldStr, newStr, userId);
  }
}
