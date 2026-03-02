# Migraciones TIUSDEI

Ejecutar una sola vez para habilitar Scrum (sprints + story points):

```bash
cd /var/www/tiusdei
mysql -u root -p tiusdei < server/db/migrations/001_scrum.sql
```

Si aparece "Duplicate column name", la migración ya estaba aplicada.
