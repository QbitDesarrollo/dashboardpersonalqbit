# Error 525 – SSL handshake failed (Cloudflare)

Cuando Cloudflare muestra **Error 525**, significa que no puede establecer una conexión HTTPS con tu servidor de origen (tiusdei.qbit.ec).

## Solución rápida (sin tocar el servidor)

1. Entra en **Cloudflare** → tu dominio **qbit.ec** (o el DNS que use tiusdei.qbit.ec).
2. Ve a **SSL/TLS** → **Overview**.
3. En **Encryption mode** cambia a **Flexible**.
   - Con **Flexible**, Cloudflare habla con tu servidor por **HTTP (puerto 80)**.
   - No necesitas certificado SSL en el servidor.
   - El sitio debería cargar de inmediato.

**Inconveniente:** Entre Cloudflare y tu servidor el tráfico va sin cifrar. Aceptable para muchos casos; para máxima seguridad usa la opción recomendada.

---

## Solución recomendada (SSL en el servidor)

Para usar **Full** o **Full (strict)** en Cloudflare, el servidor debe tener HTTPS (puerto 443) con un certificado válido.

### 1. Instalar certificado en el servidor (Let's Encrypt)

En el servidor donde está nginx:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d tiusdei.qbit.ec
```

Certbot creará el certificado y suele modificar la configuración de nginx. Si no añade un bloque `listen 443 ssl`, puedes usar el bloque SSL comentado en `deploy/nginx.conf`: descoméntalo y ajusta las rutas de los certificados si certbot las puso en otra ruta.

### 2. Ciphers compatibles con Cloudflare

El bloque SSL de ejemplo en `nginx.conf` ya usa **TLS 1.2 y 1.3** y cifrados compatibles con Cloudflare. Si usas tu propia config, asegúrate de tener:

- `ssl_protocols TLSv1.2 TLSv1.3;`
- Cifrados que soporte Cloudflare (por ejemplo los del bloque comentado en `nginx.conf`).

### 3. Comprobar y recargar nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4. En Cloudflare

- **SSL/TLS** → **Encryption mode** → **Full** (o **Full (strict)** si el certificado del origen es válido/confiable).

---

## Resumen

| Modo en Cloudflare | Origen (tu servidor)     | Resultado típico |
|--------------------|---------------------------|------------------|
| **Flexible**       | Solo HTTP (puerto 80)     | ✅ Sin Error 525  |
| **Full**           | HTTPS (443) con certificado | ✅ Sin Error 525  |
| **Full (strict)**  | HTTPS (443) con certificado válido/confiable | ✅ Sin Error 525  |

Si sigues teniendo 525 con **Full** o **Full (strict)**:

- Revisa que nginx esté escuchando en el puerto 443.
- Revisa los logs: `sudo tail -f /var/log/nginx/error.log`.
- Comprueba que el certificado no esté caducado: `sudo certbot certificates`.
