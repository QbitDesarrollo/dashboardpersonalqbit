# Ventana flotante de tareas

El chip conserva su comportamiento original cuando Document Picture-in-Picture no está disponible o Tiusdei está dentro de un iframe. En navegadores compatibles, el botón «Abrir ventana flotante» ofrece:

- «Abrir al iniciar una tarea», activado por defecto y recordado en este navegador.
- «Abrir ahora», para abrir desde el timer activo sin iniciar otra tarea.

La apertura automática ocurre en el clic en ▶, antes de cualquier espera de red. No ocurre al cambiar de pestaña: el navegador exige interacción del usuario. Un rechazo del navegador no impide iniciar el timer.

## Contenido y acciones

La ventana comparte el timer activo del encabezado, sus actualizaciones y el reloj de `useTimerClock`. Copia los estilos de Tiusdei y conserva el tema. El tamaño se recuerda con límites de 300–520 px de ancho y 220–520 px de alto.

- Muestra marca, proyecto, título, prioridad y entrega cuando están disponibles.
- La estimación usa `estimated_hours`; las subtareas vienen de `getSubtasks` y consideran listas las marcadas, entregadas o aprobadas.
- Solo cuenta eventos `es_reunion`; utiliza los helpers de reuniones para estado, fecha, proximidad e ingreso. Una reunión sin videollamada enlaza a Calendar. No ofrece unirse a reuniones terminadas.
- La línea del día muestra las reuniones. No extrapola horas trabajadas de los acumulados históricos de tareas ni de asistencia.
- «Pausar» usa `useTaskTimer.stopTimer`, con las confirmaciones y límites existentes, y cierra la ventana.
- «Terminar» pausa y envía `patchTask(id, { check_done: true })`, igual que el círculo de la lista de tareas.
- «Cambiar tarea» muestra hasta diez tareas recientes en proceso del usuario, excluyendo la actual y las marcadas como listas; pausa la actual antes de iniciar la seleccionada con `useTaskTimer`.
- «Ir a Tiusdei» enfoca la ventana principal. Cerrar la ventana flotante no pausa el timer.

## Verificación manual pendiente

En un contexto seguro y un navegador con Document Picture-in-Picture, comprobar la apertura desde ▶ y desde el chip, el tema, el resize, la permanencia sobre otras aplicaciones y el regreso a Tiusdei. Los tests de DOM simulan la ventana; no comprueban el comportamiento del administrador de ventanas del sistema operativo.
