# Minutas · enviar al cliente con enlace público — propuesta

Estado: **aprobada por Even el 28-sep-2026**. Construida (fases 1 a 4) con TDD; falta la prueba con una minuta real y el despliegue (migración 041).

## Qué es

Desde una minuta, el equipo pulsa **Enviar al cliente**, elige a quién, Tiusdei prepara un correo con un resumen redactado por Codex y un enlace público. El cliente entra con su nombre y un código de 6 caracteres y ve la minuta como en el modo presentar: puede aprobar puntos, pedir ajustes y dejar notas. No ve las tareas ni nada interno. El equipo puede apagar el enlace, cambiar el código y ver quién entró.

Nota: en septiembre se había decidido que las minutas no tuvieran página pública. Esta propuesta cambia esa decisión a pedido de Even.

## Decisiones tomadas con Even

| Tema | Decisión |
|---|---|
| Código | 6 caracteres. Va **en el mismo correo** que el enlace. |
| Entrada | El cliente elige su nombre de la lista de personas a quienes se les mandó la minuta, o "Otra persona" y lo escribe; luego pone el código. El nombre queda en la sesión firmada y en cada aprobación, ajuste y nota. No es identidad fuerte: basta para saber quién aprobó. (Se descartó un código por persona por su costo de gestión.) |
| Qué ve | Lo mismo que el modo presentar: solo los puntos visibles para el cliente y no descartados, con su resolución y evidencias. **Sin tareas** ni datos internos (responsables del equipo, miembros, dueño). Las aprobaciones hechas en reunión no muestran el nombre de quien presentaba. |
| Qué puede hacer | Aprobar un punto completado, pedir ajuste (con motivo) y dejar notas. Igual que en la reunión. |
| Gestión | El equipo puede ver y copiar el enlace y el código, apagarlo y prenderlo, cambiar el código y ver quién entró y cuándo. |
| Mensaje | Habla la plataforma, no una persona: "Hola Antonio: te enviamos la minuta de la reunión del 24 sep, *título*. En resumen: … Para revisarla, aprobar puntos o dejar tus comentarios, entra a este enlace con el código K7P2QX." El resumen lo redacta Codex y **el equipo lo revisa y edita antes de mandarlo**. |
| Dos formas de mandarlo | **Enviar desde Tiusdei** (correo con la plantilla) o **Copiar mensaje** (el mismo texto con enlace y código, para pegarlo en WhatsApp o en el correo propio). Las dos quedan en el historial: "enviado por correo" o "copiado por X". |

## Propuestas a confirmar

1. **Destinatarios.** Hoy no existe una lista de contactos del cliente: la tabla `clients` tiene 5 registros con un solo correo y "Qbit" agrupa 23 marcas. Propuesta: en el diálogo de envío se escribe nombre y correo; Tiusdei los guarda como **contactos de la marca** y la próxima vez los sugiere. Se pueden elegir varios; el primero va en "Para" y el resto también (sin copia oculta).
2. **Un enlace por minuta**, no uno por persona. Todos los contactos usan el mismo enlace y código; cada uno se identifica con su nombre al entrar.
3. **Sin vencimiento automático.** El enlace vive hasta que el equipo lo apague. Cambiar el código saca a todos los que estaban dentro.
4. **Protección del código.** El enlace lleva un token imposible de adivinar (32 bytes), que es la protección real. El código evita que alguien que vea el enlace suelto entre. Tras 5 códigos errados el enlace se bloquea 15 minutos, además del límite de pedidos por IP que ya usan las rutas públicas.
5. **Avisos al equipo.** Cuando el cliente aprueba, pide un ajuste o deja una nota: notificación en Tiusdei y correo al dueño de la minuta (mismo estilo que el tablero del cliente).
6. **Sesión del cliente (acordado: 7 días).** Al poner nombre y código, el servidor entrega una sesión firmada que incluye el nombre, la minuta y la versión del enlace; se guarda en `localStorage` del navegador para sobrevivir al cierre. Las acciones toman el nombre de la sesión, no del cuerpo del pedido. El nombre también se guarda aparte en `localStorage` solo para prellenar la entrada cuando la sesión vence (entonces se pide el código otra vez). Apagar el enlace o cambiar el código sube la versión y corta la sesión de inmediato.

   Diferencia con el tablero del cliente (`/c/:token`, `ClientBoardPublic.tsx`): allí el nombre vive solo en `localStorage` (`client_name_<token>`), sin código, y el navegador lo envía en cada acción; el servidor lo acepta tal cual. Alinear ese tablero queda fuera de esta propuesta.

## Cómo se ve

**En la minuta (equipo)**
- Botón **Enviar al cliente** → diálogo:
  1. Destinatarios: contactos sugeridos de la marca + "Agregar contacto" (nombre, correo).
  2. **Preparar correo**: Codex redacta el resumen ("Dame un momento…"); se muestra la vista previa del correo con el resumen editable.
  Vista previa: el servidor arma el mismo texto sin enviar ni registrar nada (`medio: 'vista_previa'`).
  3. **Enviar desde Tiusdei** o **Copiar mensaje**. Si la minuta no tenía enlace, se crea en ese momento. Al copiar, los destinatarios son opcionales; si se eligen, quedan en el historial y en la lista de nombres de la entrada.
- Tarjeta **Enlace para el cliente**: estado (activo / apagado / bloqueado por intentos), copiar enlace, ver y copiar código, apagar o prender, cambiar código, últimos accesos (nombre y fecha) y envíos (por correo a quién, o copiado por quién, y cuándo).

**Página pública** (`/m/:token`)
- Pantalla de entrada con el logo de Tiusdei, el título de la minuta y la marca: "Tu nombre" y "Código de acceso".
- Después, la misma presentación que usa el equipo en la reunión (encabezado, lista de puntos, punto actual, barra con Anterior / Siguiente y las acciones), sin el botón "Salir" ni enlaces internos.
- Si el enlace está apagado: "Este enlace ya no está disponible. Pídele uno nuevo a tu contacto en Qbit."

## Modelo de datos (migración `041_minutas_enlace_cliente.sql`)

Ya existen en `minutas` (migración 036, sin uso): `share_token VARCHAR(64) UNIQUE`, `share_activo TINYINT`. Y `minuta_items.aprobado_via ENUM('enlace','reunion')`.

Se agrega:
- `minutas`: `share_codigo CHAR(6)` (visible para el equipo, por eso no va con hash), `share_version INT` (sube al cambiar el código o apagar el enlace e invalida las sesiones), `share_intentos INT`, `share_bloqueado_hasta DATETIME(3)`.
- `minuta_item_notas`: `autor_nombre VARCHAR(120) NULL` y `via ENUM('interno','enlace') DEFAULT 'interno'` (las notas del cliente no tienen usuario de Tiusdei).
- `marca_contactos`: `id`, `brand_id`, `nombre`, `email`, `created_by`, `created_at`, único por `(brand_id, email)`.
- `minuta_envios`: `id`, `minuta_id`, `medio ENUM('correo','copiado')`, `para` (JSON de nombre y correo; vacío si se copió), `mensaje` (el texto que salió), `enviado_por`, `enviado_en`.
- `minuta_accesos`: `id`, `minuta_id`, `nombre`, `entro_en`.

Código: alfabeto sin caracteres confundibles (sin 0/O, 1/I/L), 6 caracteres, se compara sin distinguir mayúsculas.

## Backend

Mismo esquema que `server/src/minutas/`:
- `minutas/enlace/dominio.ts` (puro, con tests): generar código, validar intento y bloqueo, filtrar la minuta para el cliente (solo puntos visibles y no descartados, sin campos internos), reglas de las acciones reutilizando `aplicarAccion`.
- `routes/minuta-enlace.ts` (interno, `requireAuth` + `soloEquipoInterno`): ver enlace, activar/apagar, cambiar código, accesos y envíos, contactos de la marca, preparar resumen (Codex) y enviar.
- `routes/public-minuta.ts` (público, montado en `/api` como `public-client.ts`, con `rateLimit`):
  - `POST /public/minuta/:token/entrar` `{ nombre, codigo }` → sesión firmada (minuta, nombre, `share_version`, duración acordada).
  - `GET /public/minuta/:token` con la sesión → minuta filtrada.
  - `POST /public/minuta/:token/puntos/:id/aprobar`, `/ajuste` `{ motivo }`, `/notas` `{ texto }`: registran `aprobado_via = 'enlace'`, `aprobado_por_nombre` y notas con `autor_nombre` y `via = 'enlace'`, y avisan al dueño.
- Correo nuevo `minutaClienteEmail` en `services/email.ts`.

## Codex

Trabajo nuevo `minuta-resumen-cliente` en el runner (lista en `codex.mjs`, `servidor.mjs`, su test y `TipoTrabajo` del servidor; prompt y esquema en `codex-runner/reportes/`).
- Entrada: título, fecha y marca de la minuta y los puntos visibles (título, descripción, estado para el cliente, fecha comprometida, si lo debe el cliente).
- Salida: `{ resumen }`, de 2 a 4 oraciones dirigidas al cliente en voz de la plataforma ("te enviamos", no "te comparto"), sin códigos internos, sin tareas, sin nombres del equipo que no estén en los datos.
- Si Codex está ocupado o falla, el diálogo deja escribir el resumen a mano.

## Frontend

- `src/components/minutas/enlace/`: `EnviarAlClienteDialog`, `TarjetaEnlace`, `ContactosMarca`.
- `src/pages/MinutaPublica.tsx` + `src/lib/minutaPublicaApi.ts` (fetch sin token de Tiusdei, con la sesión del cliente en `localStorage`).
- Los componentes de `presentacion/` reciben las acciones por props, para que la página interna y la pública usen el mismo dibujo con distinta API.

## Fases

1. Migración y dominio (código, bloqueo, filtro de la minuta para el cliente).
2. API pública y página pública (entrar, ver, aprobar, ajuste, notas, avisos al dueño).
3. Tarjeta de gestión del enlace en la minuta.
4. Contactos de la marca, resumen con Codex y envío del correo.
5. Pruebas de punta a punta con una minuta real (Even decide cuál) y despliegue.

Cada fase con TDD, como el resto de Tiusdei.

## Fuera de alcance

- Que el cliente vea tareas, suba archivos o edite puntos.
- Un enlace distinto por contacto.
- Vencimiento automático del enlace.
