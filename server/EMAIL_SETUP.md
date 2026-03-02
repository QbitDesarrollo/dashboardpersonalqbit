# Configuración de emails TIUSDEI

## Enviar desde qbitdashboard@gmail.com

1. En `server/.env`:
   ```
   SMTP_USER=qbitdashboard@gmail.com
   SMTP_PASS=tu_app_password_de_16_caracteres
   SMTP_FROM="TIUSDEI <qbitdashboard@gmail.com>"
   ```

2. **App Password de Gmail** (requerido si tienes 2FA):
   - Google Account → Seguridad → Verificación en 2 pasos (activada)
   - Contraseñas de aplicaciones → Generar → Nombre: "TIUSDEI"
   - Copia la contraseña de 16 caracteres en `SMTP_PASS`

3. Reinicia el servidor: `pm2 restart tiusdei-api`

## Tipos de notificaciones

| Tipo | Cuándo | Plantilla |
|------|--------|-----------|
| **Nueva tarea asignada** | Al crear/editar tarea con responsable | Logo Tiusdei, tabla (Marca, Tarea, Detalle, Archivos adjuntos, Prioridad, Fecha ingreso, Deadline) |
| **Aviso deadline** | Automático cada 24h; tareas que vencen en 2 días | Similar diseño, aviso de días restantes |
| **Cambio de estado** | Al actualizar estado de tarea | Flecha antiguo → nuevo estado |
| **Entregable aprobado** | Al aprobar entregable | Confirmación con check |

## Avisos de deadline

- El servidor ejecuta un job cada 24h (1 min tras arrancar, luego cada día).
- Busca tareas con `fecha_entrega` en los próximos 2 días, estado distinto de entregado/aprobado.
- Envía un email al responsable de cada tarea.

## Cron manual (opcional)

Para disparar avisos desde un cron externo:

```bash
# En .env añadir: CRON_SECRET=un_secreto_largo_aleatorio
curl -X POST https://tiusdei.qbit.ec/api/email/deadline-warning \
  -H "Authorization: Bearer TU_CRON_SECRET" \
  -H "Content-Type: application/json"
```
