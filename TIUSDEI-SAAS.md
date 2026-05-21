# TIUSDEI

### Plataforma de Gestion de Proyectos y Entregas Digitales

---

## El problema

Las agencias digitales, equipos de marketing y empresas de desarrollo pierden tiempo valioso usando herramientas dispersas: una para tareas, otra para archivos, otra para comunicacion, otra para reportes. Esto genera:

- Falta de visibilidad del estado real de los proyectos
- Entregas fuera de plazo por mala coordinacion
- Clientes que no saben en que estado van sus proyectos
- Equipos sin metodologia clara de trabajo
- Perdida de archivos y versiones en correos y chats

---

## La solucion: Tiusdei

Tiusdei es una plataforma todo-en-uno que centraliza la gestion de proyectos, tareas, entregas, comunicacion y reportes en un solo lugar. Disenada especificamente para agencias y equipos creativos que necesitan orden, velocidad y transparencia.

---

## Funcionalidades principales

### 1. Gestion de tareas avanzada

Multiples vistas para adaptarse a tu forma de trabajar:

| Vista | Descripcion |
|-------|-------------|
| **Lista** | Vista clasica con filtros avanzados y acciones masivas |
| **Kanban** | Tablero drag-and-drop por estado |
| **Gantt** | Linea de tiempo visual con dependencias |
| **Calendario** | Tareas organizadas por fecha de entrega |
| **Workload** | Carga de trabajo por miembro del equipo |

Cada tarea incluye:
- Subtareas y dependencias
- Prioridades (Alta, Media, Baja)
- Comentarios y menciones
- Archivos adjuntos
- Historial de actividad completo
- Cronometro de tiempo trabajado

### 2. Sistema Scrum completo

Modulo completo de metodologia agil integrado:

- **Backlog** - Gestiona y prioriza las historias de usuario
- **Sprint Planning** - Planifica sprints con capacidad del equipo
- **Board** - Tablero de sprint con drag-and-drop
- **Daily** - Registro de dailys y sincronizaciones
- **Burndown** - Graficas de avance en tiempo real
- **Releases** - Planificacion de lanzamientos
- **Dashboard gerencial** - Metricas de velocidad, features y progreso global

### 3. Entregables con flujo de aprobacion

Sistema de entregables con workflow profesional:

```
Borrador -> En Revision -> Aprobado/Rechazado -> Final
```

- Aprobacion en multiples etapas (QA, Cliente, Operaciones)
- Registro de quien aprobo y cuando
- Versionamiento de archivos
- Seguimiento de progreso por porcentaje

### 4. Portal de clientes

Tus clientes acceden con su propia cuenta para:

- Ver el estado de sus proyectos y entregas
- Revisar y aprobar entregables
- Consultar archivos finales
- Sin acceso a informacion interna del equipo

### 5. Chat en tiempo real

Comunicacion instantanea dentro de la plataforma:

- Canales por mesa/equipo de trabajo
- Mensajes en tiempo real con Socket.io
- Indicadores de presencia online
- Sin necesidad de herramientas externas

### 6. Integracion con Google

Conecta tu ecosistema Google directamente:

- **Google Drive** - Navega, busca y adjunta archivos desde Drive sin salir de Tiusdei
- **Google Calendar** - Sincroniza tareas con tu calendario, visualiza eventos
- **Google Auth** - Inicio de sesion con cuenta de Google

### 7. Asistente de IA (Gemini)

Inteligencia artificial integrada para:

- Responder preguntas sobre tus proyectos
- Resumir informacion de tareas y entregas
- Asistente conversacional con contexto de tu workspace
- Historial de conversaciones guardado

### 8. Automatizaciones

Crea reglas automaticas para reducir trabajo manual:

**Triggers disponibles:**
- Cambio de estado
- Fecha alcanzada
- Cambio de asignacion
- Tarea creada
- Cambio de prioridad
- Comentario agregado

**Acciones automaticas:**
- Cambiar estado de tarea
- Enviar notificacion
- Enviar email
- Asignar responsable
- Cambiar prioridad
- Agregar comentario
- Crear subtarea

### 9. Reportes y exportacion

- Reportes de tareas con filtros avanzados
- Analiticas de tiempo trabajado por usuario, marca y tarea
- Estadisticas de sprint (velocidad, burndown, capacidad)
- Exportacion a **PDF**, **Excel** y **CSV**
- Dashboard gerencial con graficas interactivas

### 10. Gestion de equipos y marcas

- **Marcas/Proyectos** - Organiza el trabajo por marca o proyecto
- **Mesas de trabajo** - Agrupa equipos por area o funcion
- **Roles y permisos** - Control granular de acceso (Admin, Ops, Equipo, Cliente)
- **Filtros globales** - Filtra toda la plataforma por marca o mesa en un click

### 11. Plantillas de tareas

- Crea plantillas reutilizables para tareas recurrentes
- Aplica plantillas para generar multiples tareas en segundos
- Estandariza procesos y flujos de trabajo

### 12. Formularios publicos

- Crea formularios accesibles sin login
- URL personalizada por formulario
- Cada envio crea automaticamente una tarea
- Ideal para recibir solicitudes de clientes o tickets de soporte

### 13. Notificaciones inteligentes

- Notificaciones en tiempo real dentro de la app
- Alertas por email personalizables
- Plantillas de email editables
- Avisos de vencimiento de plazos
- Sonidos configurables

### 14. Archivos y documentos

- Subida directa de archivos a tareas y entregables
- Integracion con Google Drive
- Visor de archivos centralizado
- Organizacion automatica por tarea y proyecto

---

## Roles y permisos

| Rol | Descripcion | Acceso |
|-----|-------------|--------|
| **Admin** | Control total del sistema | Todo: usuarios, configuracion, marcas, integraciones |
| **Operaciones** | Gestion de proyectos y clientes | Tareas, clientes, marcas, automatizaciones, formularios |
| **Equipo** | Ejecucion del trabajo | Sus tareas, comentarios, archivos, tiempo, Scrum |
| **Cliente** | Seguimiento externo | Ver entregas y estado de sus proyectos (solo lectura) |

---

## Tecnologia

| Componente | Tecnologia |
|------------|-----------|
| Frontend | React + TypeScript + Tailwind CSS |
| Backend | Node.js + Express.js |
| Base de datos | MySQL |
| Tiempo real | Socket.io |
| IA | Google Gemini |
| Autenticacion | JWT + Google OAuth |
| PWA | Instalable como app nativa |

---

## Planes y precios

### Starter - $29/mes
- Hasta 5 usuarios
- Gestion de tareas (todas las vistas)
- 2 marcas/proyectos
- Chat en tiempo real
- 5 GB de almacenamiento
- Soporte por email

### Professional - $79/mes
- Hasta 20 usuarios
- Todo lo del plan Starter
- Modulo Scrum completo
- Entregables con aprobacion
- Portal de clientes
- Automatizaciones (hasta 20 reglas)
- Integracion Google Drive y Calendar
- Plantillas de tareas
- Reportes y exportacion
- 25 GB de almacenamiento
- Soporte prioritario

### Business - $149/mes
- Hasta 50 usuarios
- Todo lo del plan Professional
- Automatizaciones ilimitadas
- Formularios publicos
- Asistente IA (Gemini)
- Marca blanca (logo y colores personalizados)
- Notificaciones por email personalizadas
- 100 GB de almacenamiento
- Soporte dedicado

### Enterprise - Precio personalizado
- Usuarios ilimitados
- Todo lo del plan Business
- Instalacion on-premise o nube privada
- Integraciones personalizadas (Slack, GitHub, GitLab)
- SLA garantizado
- Onboarding y capacitacion
- Almacenamiento ilimitado
- Soporte 24/7

---

## Por que Tiusdei?

| Caracteristica | Tiusdei | Asana | Monday | ClickUp |
|----------------|---------|-------|--------|---------|
| Gestion de tareas multiview | Si | Si | Si | Si |
| Scrum completo integrado | Si | Parcial | No | Parcial |
| Entregables con aprobacion | Si | No | No | No |
| Portal de clientes | Si | No | No | No |
| Chat en tiempo real | Si | No | No | Si |
| Google Drive integrado | Si | Parcial | Parcial | Parcial |
| Asistente IA contextual | Si | Si | Si | Si |
| Automatizaciones | Si | Si | Si | Si |
| Formularios publicos | Si | Si | Si | Si |
| Marca blanca | Si | No | No | No |
| Precio accesible | Si | No | No | Parcial |

---

## Casos de uso ideales

**Agencias digitales y de marketing**
- Gestiona multiples marcas y clientes desde un solo lugar
- Entrega assets con flujo de aprobacion profesional
- Dale a tus clientes visibilidad sin exponer tu operacion interna

**Equipos de desarrollo de software**
- Scrum completo con sprints, backlog, burndown y planning
- Integracion con GitHub/GitLab
- Dailys y retrospectivas integradas

**Estudios de diseno y produccion**
- Gestiona entregables con versionamiento
- Flujo de aprobacion multietapa
- Archivos centralizados con Google Drive

**Empresas con equipos remotos**
- Chat y notificaciones en tiempo real
- Workload para balancear cargas de trabajo
- Cronometro de tiempo por tarea

---

## Contacto

**Desarrollado por Fadel Ibanez / Qbit Digital**

- Web: tiusdei.qbit.ec
- Email: contacto@qbit.ec

---

*Tiusdei - Tu equipo, tus proyectos, tus entregas. Todo en un solo lugar.*
