# Ventana flotante de tareas

El chip conserva su comportamiento original cuando Document Picture-in-Picture no está disponible o Tiusdei está dentro de un iframe. En navegadores compatibles, el botón «Abrir ventana flotante» ofrece:

- «Abrir al iniciar una tarea», activado por defecto y recordado en este navegador.
- «Abrir ahora», para abrir desde el timer activo sin iniciar otra tarea.

La apertura automática ocurre en el clic en ▶, antes de cualquier espera de red. No ocurre al cambiar de pestaña: el navegador exige interacción del usuario. Un rechazo del navegador no impide iniciar el timer.

## Contenido y acciones

La ventana comparte el timer activo del encabezado, sus actualizaciones y el reloj de `useTimerClock`. Copia los estilos de Tiusdei y conserva el tema. Se abre a 320 × 190 px por defecto. El tamaño se recuerda con límites de 280–480 px de ancho y 160–360 px de alto; las dimensiones guardadas que superan el nuevo máximo se descartan.

- Encabezado compacto con marca, proyecto y el botón de icono «Ir a Tiusdei»; el cierre pertenece al sistema operativo. Título de una línea con texto completo al pasar el puntero.
- Prioridad con un punto de color, sin badge, y conteo de subtareas en la misma línea. La entrega es un día civil de Ecuador, sin hora ni conversión desde UTC: «Vencida · 25 sept», «Entrega hoy», «Entrega mañana» o «Entrega jue 30 oct».
- La estimación usa `estimated_hours`; las subtareas vienen de `getSubtasks` y consideran listas las marcadas, entregadas o aprobadas.
- Solo cuenta eventos `es_reunion`; utiliza los helpers de reuniones para estado, fecha, proximidad e ingreso. Una reunión sin videollamada enlaza a Calendar. No ofrece unirse a reuniones terminadas.
- Muestra una línea con la reunión en curso («Ahora») o la siguiente de hoy («15:00», hora de Ecuador), con acceso a su videollamada. Sin reuniones pendientes, omite la fila. No extrapola horas trabajadas de los acumulados históricos de tareas ni muestra conteos aislados.
- Los controles «Pausar», «Terminar» y «Cambiar tarea» son botones de icono con tooltip y nombre accesible, junto al timer compacto y su estimación opcional.
- «Pausar» usa `useTaskTimer.stopTimer`, con las confirmaciones y límites existentes, y cierra la ventana.
- «Terminar» pausa y envía `patchTask(id, { check_done: true })`, igual que el círculo de la lista de tareas.
- «Cambiar tarea» abre un popover dentro del documento flotante con marca y título de hasta diez tareas recientes en proceso del usuario, excluyendo la actual y las marcadas como listas; pausa la actual antes de iniciar la seleccionada con `useTaskTimer`.
- «Ir a Tiusdei» enfoca la ventana principal. Cerrar la ventana flotante no pausa el timer.

## Verificación manual pendiente

En un contexto seguro y un navegador con Document Picture-in-Picture, comprobar la apertura desde ▶ y desde el chip, el tema, el resize, la permanencia sobre otras aplicaciones y el regreso a Tiusdei. Los tests de DOM simulan la ventana; no comprueban el comportamiento del administrador de ventanas del sistema operativo.
