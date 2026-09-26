# Reportes semanales de proyecto — plan

Definido con Even el 25–26 de septiembre de 2026. Estado (26-sep): **fases 1 a 5 construidas y probadas, sin desplegar**.

Dónde está el código: `server/src/reportes/` (dominio, consultas, generador, pdf, repositorio, servicio, programador),
`server/src/routes/reportes.ts`, migración `040`, `codex-runner/reportes/` y en el front `src/components/proyectos/`,
`src/lib/reportesApi.ts` y `src/hooks/usePendientesReportes.ts`.

Diferencias con el plan, decididas al construir:
- Crear un proyecto sin líder solo pasa por la creación rápida del tablero del cliente (que no se toca): ahí queda como líder quien lo crea. La pantalla de Proyectos siempre lo pide.
- El avance (%) del reporte usa los mismos números que la pantalla de Proyectos (cuenta subtareas).
- "Generar ahora" lo pueden usar el líder y admin; no manda el correo de "listo" (lo pidió la misma persona).

## Formato del reporte (versión 3, rehecho con Even el 26-sep)
Historia: la versión 1 listaba todo el proyecto (7 páginas); la 2 armaba "esta semana" con cualquier tarea que tuvo movimiento (62 filas, incluidas tareas que vencían la semana siguiente), contaba como alerta traer fechas hacia adelante y daba números sin contexto. La vigente responde "¿qué se hizo esta semana y cómo está el proyecto?".

**Reglas**
- La semana es la **semana calendario** (lunes a domingo) y se mide por **fecha de entrega**, no por movimiento ni por fecha de creación. Una semana en curso se corta hoy, pero sus entregas siguen siendo las de lunes a domingo.
- Estados y fechas se toman **al cierre** (historial de estados y de fechas), no los de hoy.
- **Vencida** = sin entregar y con fecha anterior al corte, igual que Tiusdei (`revision_cliente` no cuenta: espera al cliente). En la semana en curso, lo que vence hoy todavía no está vencido.
- **Semáforo** con la regla de la pantalla de Proyectos (`autoSalud`): rojo si hay vencidas o la fecha de cierre del proyecto pasó; amarillo si algo vence en los 3 días siguientes; verde si no. Si alguien fijó la salud a mano, el reporte lo aclara ("En Tiusdei el proyecto está marcado en verde a mano").
- **Entrega**: el último cambio que cerró la tarea hasta el corte; si después se reabrió, esa entrega ya no vale. Si se cerró sin quedar en el historial (el MCP antes del 24-sep no lo registraba), dice "Entregada (sin fecha registrada)" en vez de inventar una fecha.
- **Postergada** = la fecha terminó más adelante que al empezar la semana. Traer una fecha hacia adelante no es riesgo. Varios cambios de una tarea en la semana se muestran como uno (de la primera fecha a la última); si vuelve a la misma, no aparece.
- Solo tareas principales; el avance general cuenta también subtareas, como la pantalla de Proyectos.

**PDF**
1. **De un vistazo**: semáforo con su frase (y la nota si hay salud manual), avance general ("36% · 33 de 92 tareas terminadas · al empezar la semana: 16%"), y cuatro cuadros: entregas de la semana (cumplidas de previstas), vencidas sin entregar, postergadas y vencen la próxima semana. Resumen ejecutivo y hasta 3 logros, decisiones y riesgos.
2. Una tabla por pregunta, cada una con una línea que explica qué contiene: **Entregas de la semana**, **Atrasadas de semanas anteriores**, **Otras entregas de la semana** (vencían en otra semana o sin fecha), **Cambios de fecha** (antes, ahora, motivo; postergadas primero), **Próxima semana** (calendario) y **Otras tareas abiertas**. Las vacías no se muestran, salvo entregas y próxima semana, que lo dicen.
3. Una fila por tarea con resultado en frase fija: "Entregada el 22 sep · 1 día tarde" (ámbar), "En proceso · 4 días de atraso" (rojo), "Entregada el 23 sep · a tiempo" (verde). Ninguna fila se parte entre páginas.

**IA**
- Codex recibe `hechos_clave`: los números ya redactados por Tiusdei ("De las 36 tareas que vencían esta semana, 20 están entregadas."). El prompt le prohíbe calcular cifras propias y le exige decir a qué se refiere cada número.
- Los resúmenes de comentarios ya no se imprimen bajo cada fila: alimentan el resumen, los logros, las decisiones y los riesgos.
- Sin códigos internos (BOT-012, [v1.1]…) en lo que redacta la IA.
- Semanas elegibles en la pantalla: esta semana hasta hoy (parcial) y las 11 anteriores. El reporte automático reemplaza la semana parcial. Un reporte de una versión anterior pide regenerarse.

## Qué es

Cada proyecto puede generar un reporte periódico de cómo va su trabajo. Es un documento **interno** (para líderes y jefaturas, nunca para el cliente). Tiusdei junta los hechos, Codex los redacta, el líder del proyecto lo revisa, lo aprueba y lo envía por correo en PDF a personas de Tiusdei.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Dónde vive | En **Proyectos** (no en Minutas). |
| Para quién | Interno. Destinatarios y copias: **solo usuarios de Tiusdei**. |
| Quién lo maneja | El **líder del proyecto**: configura la cadencia, revisa, regenera, aprueba y envía. Admin también puede. No hay reportes "por defecto" para nadie más. |
| Líder obligatorio | Un proyecto no se crea ni se guarda sin líder. Los existentes sin líder (14 de 20 al 26-sep) muestran un aviso hasta tenerlo. Sin líder no se activan reportes. |
| Cadencia | La configura el líder: día y hora de entrega (por defecto **lunes 08:00**, hora de Ecuador) y el periodo (por defecto la semana anterior, lunes a domingo). Se puede desactivar. |
| Generación | **Anticipada**: empieza unas horas antes de la hora de entrega, en cola. A la hora pedida el borrador ya está listo. |
| Fallos | **3 reintentos**. Si igual falla: correo al líder ("hubo un problema generando el reporte"). |
| Aviso de listo | A la hora de entrega: notificación en Tiusdei, contador en el menú **Proyectos** (como Incidencias) y correo "Tu reporte del proyecto X está listo". |
| Corte | El reporte es una foto del periodo cerrado. Si después cambian las tareas, el reporte no cambia (salvo que se regenere mientras es borrador). |
| Estados | `borrador` → `aprobado`. **Regenerar** solo en borrador, con una indicación opcional para la IA ("resalta los atrasos", "menos técnico"): usa el borrador anterior, los datos nuevos y la indicación. Mismo flujo "Dame un minuto…" con polling que el generador de minutas. Aprobado ya no se regenera. |
| Envío | Solo aprobados. Se puede enviar **las veces que quiera**: elige destinatarios y copias. Queda registro de cada envío. |
| Correo | Estilo Tiusdei: "Hola [nombre], aquí está el reporte semanal del proyecto X, generado por Tiusdei y aprobado por [líder]", un mini resumen y el **PDF adjunto**. |
| Sin comentarios | La tarea no pasa por Codex. Plantilla fija: *"[Título]: consiste en [de qué trata]. Está en [estado], a cargo de [responsable], entrega [fecha]. No hay comentarios del equipo en este periodo."* |
| Calidad del dato | El reporte muestra lo que hay. Descripciones pobres son tema del equipo; el reporte hace visible lo que falta. |

## Estructura del PDF (aprobada)

1. **Encabezado**: logo y colores de Tiusdei, proyecto y marca, periodo, líder, "Generado el … · Aprobado por …".
2. **Resumen ejecutivo**: 3 a 5 líneas (Codex) + indicadores (completadas, en curso, bloqueadas, atrasadas, % de avance) + salud del proyecto (`projects.salud`).
3. **Destacados**: logros, decisiones, bloqueos y riesgos; cada uno cita la tarea de donde sale.
4. **Detalle por estado**: una tabla por grupo (título, responsable, entrega, días de atraso) y debajo de cada tarea su línea de avance (de Codex o la plantilla fija).
5. **Próximo periodo**: lo que vence en el siguiente periodo.
6. **Sin actualización**: tareas sin comentarios en el periodo.

## Datos medidos en producción (26-sep-2026)

| | Mediana | 90 % | Máximo |
|---|---|---|---|
| Descripción de tarea (caracteres de texto) | 186 | 1.326 | 8.022 |
| Comentario | 173 | 2.071 | 6.627 |
| Comentarios por tarea | 1 | 3 | 10 |
| Tareas de un proyecto en una semana | 2 | 20 | 85 |

- Semana más pesada de un proyecto: 85 tareas, 45 comentarios, ~67 mil tokens.
- GPT-6-Luna (modelo del runner): **272 mil tokens de contexto** (`~codex-ia/.codex/models_cache.json`). Todo entra; el problema es el foco, no el tamaño.
- Solo 1 comentario tiene una imagen en base64 incrustada.
- Solo 486 de 3.599 tareas principales tienen proyecto: el valor del reporte depende de que se usen los proyectos.

## Cómo se genera: por capas, sin recortar

El modelo es barato; de un solo tiro con muchas tareas se salta cosas (ya pasó con el prompt de minutas). Cada capa es corta, verificable y reintentable por separado.

- **Capa 0 — Tiusdei, sin IA.** Qué tareas entran, en qué grupo va cada una, números, días de atraso, próximas entregas, cambios de estado (`activity_log`) y la plantilla de las tareas sin comentarios.
  - Entran: tareas principales del proyecto abiertas al cierre del periodo y las cerradas **durante** el periodo. Las subtareas cuentan como avance de su tarea madre (n/m).
  - Bloqueada = estado `bloqueado`. Atrasada = abierta con `fecha_entrega` anterior al cierre del periodo.
- **Capa A — "De qué trata" cada tarea, una sola vez.** La descripción casi siempre es la especificación y no cambia semana a semana. Codex la condensa en 1–2 líneas y se guarda con el hash de la descripción; se reutiliza cada semana y solo se recalcula si la descripción cambia.
- **Capa B — Avance por tarea.** Solo tareas con comentarios en el periodo, con **los comentarios del periodo completos** y sus cambios de estado. Salida por tarea: `{ task_id, avance, decision, bloqueo }` en una línea cada campo. Lotes **por tamaño** (presupuesto de caracteres por llamada), no por cantidad: una tarea larga va sola, las cortas se agrupan. Resultado cacheado por hash de su entrada (para no repetir llamadas al regenerar).
- **Capa C — Redacción final.** Recibe solo los números de la capa 0 y las líneas de A y B. Devuelve resumen ejecutivo, destacados (cada uno con sus `task_id`) y el mini resumen del correo. Al regenerar recibe además el borrador anterior y la indicación del líder.
- **Verificación.** Tiusdei descarta destacados que citen tareas que no están en el reporte (mismo espíritu que `ubicarCita` en minutas).
- **Limpieza de entrada.** Texto sin HTML, imágenes como `[imagen]`, sin base64, menciones con nombre.
- **Red de seguridad.** Si una tarea supera un tope alto de caracteres, sus comentarios se procesan por tramos cronológicos y se unen. Hoy ninguna llega; es protección.

## Modelo de datos (migración `040_reportes_proyecto.sql`)

- `proyecto_reportes_config` — `project_id` (PK), `activo`, `dia_entrega` (1–7), `hora_entrega` (hora Ecuador), `anticipacion_horas` (por defecto 3), `updated_by`, `updated_at`.
- `proyecto_reportes` — `id`, `project_id`, `periodo_desde`, `periodo_hasta` (DATE), `entregar_en` (UTC), `estado` (`programado`, `generando`, `borrador`, `aprobado`, `fallido`), `intentos`, `error`, `contenido` (JSON: hechos de la capa 0 + redacción), `indicaciones`, `generado_en`, `notificado_en`, `aprobado_por`, `aprobado_en`, `pdf_path`. Único por (`project_id`, `periodo_desde`).
- `proyecto_reporte_envios` — `id`, `reporte_id`, `enviado_por`, `para` y `cc` (ids de usuario), `enviado_en`.
- `tarea_resumenes_ia` — `task_id` (PK), `hash_detalle`, `resumen`, `updated_at` (capa A).
- `reporte_avances_ia` — `hash_entrada` (PK), `salida` (JSON), `created_at` (caché de la capa B).

## Backend (`server/src/reportes/`, mismo esquema que `server/src/minutas/`)

- `dominio.ts` (puro, con tests): periodo y `entregar_en` a partir de la configuración y "ahora" (en hora de Ecuador); clasificación de tareas; lotes por tamaño; plantilla sin comentarios; verificación de citas; transiciones de estado.
- `consultas.ts`: tareas del proyecto en el periodo, comentarios del periodo, cambios de estado.
- `generador.ts`: arma las capas y llama al runner.
- `pdf.ts`: PDF en el servidor con jsPDF + jspdf-autotable (las mismas librerías del PDF de minutas). Se genera al vuelo en borrador y se guarda al aprobar.
- `programador.ts`: tarea cada 5 minutos, registrada como las demás en `index.ts`.
  1. Crea el reporte `programado` cuando `entregar_en - anticipacion_horas` ya pasó.
  2. Toma **uno** a la vez (`UPDATE … SET estado='generando' WHERE estado='programado' … LIMIT 1`, a prueba de dos procesos).
  3. Si falla: `intentos + 1` y vuelve a `programado` con espera (10 y 30 min); al tercer fallo pasa a `fallido` y avisa por correo al líder.
  4. A la hora de `entregar_en`, si está en borrador y no se avisó: notificación + correo "listo".
- **Rutas** (`server/src/routes/reportes.ts`), solo líder del proyecto o admin:
  - `GET/PUT /projects/:id/reportes/config`
  - `GET /projects/:id/reportes` (historial)
  - `GET /reportes/:id` · `GET /reportes/:id/pdf`
  - `POST /reportes/:id/regenerar` `{ indicaciones? }` → 202 y polling con `GET /reportes/:id`
  - `POST /reportes/:id/aprobar`
  - `POST /reportes/:id/enviar` `{ para: userId[], cc: userId[] }` (solo aprobados)
  - `GET /reportes/pendientes` (para el contador del menú: borradores listos de mis proyectos)
  - `POST /projects/:id/reportes/generar-ahora` (solo admin, para pruebas y para la fase 1)
- **Correo** (`services/email.ts`): `EmailOptions` gana `attachments`, en Mailgun y en SMTP.
- **Proyectos** (`routes/projects.ts`): `lider_user_id` obligatorio al crear; no se puede dejar en blanco al editar.
- **Cupo de IA**: los reportes no consumen el cupo diario de minutas de las personas.

## Runner de Codex (`codex-runner/`, desplegado en `/opt/codex-runner`)

Tres endpoints nuevos con su prompt y su JSON Schema, con el mismo endurecimiento, token y "un trabajo a la vez":
`POST /tarea-resumen` (capa A), `POST /reporte-avances` (capa B), `POST /reporte-resumen` (capa C).

Desplegar el runner toca `/opt/codex-runner` y su servicio systemd, fuera de `/var/www/tiusdei`: se hace igual que cuando se instaló.

## Pantallas

- **Proyectos**: líder obligatorio en crear y editar; aviso en los que no tienen.
- **Menú lateral**: contador en *Proyectos* con los borradores listos para revisar (como Incidencias).
- **Proyecto → Reportes** (modal o pestaña: se decide al diseñar):
  - Configuración (solo líder y admin): activar, día, hora.
  - Historial: fecha, periodo y estado de cada reporte.
  - Ver: el PDF dentro de Tiusdei, con opción de abrirlo aparte.
  - Borrador: **Regenerar** (cuadro para la indicación, "Dame un minuto…", polling) y **Aprobar**.
  - Aprobado: **Enviar** (selector de personas de Tiusdei para "Para" y "CC"; se reutiliza `SelectorEquipo`) y la lista de envíos hechos.

## Fases

Todo con TDD (dominio sin base de datos; rutas contra `tiusdei_test`) y deploy como siempre.

1. **Base**: líder obligatorio, migración 040, dominio puro con tests (periodo, clasificación, lotes, plantilla, estados).
2. **Generación manual**: consultas, capas A–C, endpoints del runner y prompts, "Generar ahora" (admin). **Hito: un reporte real del proyecto más pesado, revisado con Even** antes de seguir.
3. **Revisión**: PDF en el servidor, pantalla de reportes, regenerar con indicación y aprobar.
4. **Envío**: correo con adjunto, selector de destinatarios y copias, registro de envíos.
5. **Automático**: configuración de cadencia, programador con reintentos, correos de listo y de fallo, contador en el menú.
6. **Después**: skill para escribir buenos comentarios (*Avance / Decisión / Bloqueo / Siguiente*), para personas y para la IA vía MCP.

## Riesgos y cosas a vigilar

- **Cola del lunes**: el runner hace una cosa a la vez. Hay que medir el tiempo real por reporte en la fase 2 y ajustar la anticipación por defecto.
- **Un solo proceso del API**: el programador asume una sola instancia de `tiusdei-api`; el `UPDATE … LIMIT 1` lo protege si algún día hay más.
- **Zona horaria**: periodos, "lunes 08:00" y cortes se calculan en `America/Guayaquil`; el servidor y MySQL siguen en UTC.
- **Adopción**: con pocas tareas asignadas a proyectos, los reportes saldrán cortos. Es un incentivo para usar proyectos, no un bloqueo.
