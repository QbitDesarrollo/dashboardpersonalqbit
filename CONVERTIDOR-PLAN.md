# Convertidor de contenidos — Plan completo
**Pedido de Juan José Vivas (WhatsApp, 6-jul-2026) · Documentado por Claude para Fadel Ibañez · Estado: en definición, listo para Fase 1**

---

## 1. El pedido original de Juan (fiel, sin recortar)

> "Hay que crear un convertidor para una URL única para todo el equipo. Esa URL debería estar alojada en Nebula o en Tiusdei.
> El convertidor debería poder leer los entregables que tiene el cliente para calcular si la conversión de formatos de contenido es viable. Luego habría que también estar atado al tarifario de Qbit para de esa manera poder saber:
> - cuánto vale un post
> - cuánto vale un reel
> - cuánto vale un carrusel
> - cuánto vale un banner digital
>
> Si el cliente solicita un reel adicional que no está en sus entregables, podría cambiarlo por dos o tres posts dependiendo de cómo está la conversión de lo que vale el post versus lo que vale el reel y validar si en el contenido contratado por el cliente tiene capacidad para poder hacer ese cambio."

> "Esto tendría como objetivo **estandarizar la entrega de contenidos** de los clientes, porque siempre piden más contenido, cambian el contenido, hacen algo mal y lo unifican con otro tipo de contenido. **Eso no está monitoreado por nadie** y es una de las razones por las cuales el equipo termina con mucho **retrabajo** o las cuentas terminan **sin rentabilidad**, porque están haciendo más contenido de lo que está contratado."

> "Ahorita estamos haciendo un **contrato** en donde estamos incluyendo, precisamente ya por escrito, cómo puede el cliente cambiar contenido que tiene contratado por otro contenido si es que lo necesita en el despliegue de sus campañas de **Always On mensual**."

> "Le dije a **Iván** que teníamos que conversar para poder ver cómo hacemos esto. En teoría, para mí, el tarifario es el que debería decir: si un post vale $20, por ejemplo, y un reel vale $60, entonces, si el cliente necesita un reel adicional, debería de cambiarlo por **tres posts**. Si el cliente tiene un **post animado**, vale **dos posts estáticos** — tiene capacidad para cambiarlo por dos posts estáticos, y los dos estáticos saldrían del entregable del mes."

> "Creo que tendría que tener **acceso desde Nebula y desde Tiusdei**. Debería de compartir **el mismo Drive que comparte Nebula, como contexto del contrato**. Steven hizo hace tiempo algo que se llamaba **Client Hop**, y en Client Hop estaban los entregables, el tiempo de contrato, la fecha de renovación — todo eso debe salir igual de los documentos. **Lo importante es hacer el cerebro y luego linkear las herramientas**. El launch del convertidor puede ser desde Nebula o desde Tiusdei, porque hoy día no estamos haciendo contenido de todas las marcas en Nebula, pero sí se está gestionando desde Tiusdei."

**Pregunta de Fadel sin respuesta aún:** "¿el tarifario quién lo tiene?" (Iván está en esa conversación).

---

## 2. Decisión de arquitectura (recomendada)

**El Convertidor vive en Tiusdei; la inteligencia de lectura de contratos vive en Nebula.**
Razón: Tiusdei gestiona TODAS las marcas (49 brands, 14 mesas, 66 usuarios, 2081 tasks) y el equipo entero trabaja aquí; Nebula (147.182.205.212, `/opt/nebula-alpha`, nebulav2.qbit.ec) tiene el cerebro con los contratos del Drive ya indexados y la infraestructura de IA.

| Pieza | Dónde | Cómo |
|---|---|---|
| Tarifario (valores por formato) | Tiusdei (tabla nueva + UI admin) | Atado al catálogo `deliverable_types` existente |
| Entregables contratados por marca | Tiusdei (tabla nueva) | El "Client Hop" de Steven, pero vivo |
| Ledger de canjes | Tiusdei (tabla nueva) | Auditable: quién, cuándo, saldo antes/después |
| Página `/convertidor` (URL única) | tiusdei.qbit.ec/convertidor | Linkeada también desde Nebula |
| Lectura del contrato → propuesta de entregables | IA de Nebula (patrón entrevista: propone → ejecutivo confirma) | Escribe a Tiusdei vía API |
| Validación al cargar contenido extra | Nebula Preaprobación consulta saldo vía API de Tiusdei | "Este reel consume 3 posts — ¿confirmas?" |
| Canje aprobado → tarea de producción | MCP de Tiusdei (`create_task`) | Ya existe en `/var/www/tiusdei/mcp-server` |

## 3. La joya: tarifario basado en datos reales
Tiusdei tiene `time_entries` (horas reales por tarea) y 2081 tasks históricas con tipos. **Antes de pedirle el tarifario a Iván, calcular el costo real en horas por tipo de entregable** (reel vs post vs carrusel vs banner). El tarifario deja de ser opinión: "un reel vale 3 posts porque toma 3.2× más horas". Entregar ese análisis en la reunión con Iván.

## 4. Modelo de canje (decisión de producto pendiente de Juan)
1. Equivalencias fijas (1 reel = 3 posts) — simple, rígido.
2. Todo en dólares — flexible, expone precios internos.
3. **Créditos mensuales (RECOMENDADO)**: el cliente contrata N créditos/mes; post=20, reel=60, carrusel=35, banner=15 (valores de ejemplo). El contrato dice "puedes redistribuir tus créditos". Flexibilidad como feature vendible; el tarifario en $ queda interno.

## 5. Reglas de negocio (defaults propuestos, Juan confirma)
- Solo el EQUIPO registra canjes (el cliente pide, no ejecuta) — igual que el calendario de Nebula.
- Cada canje con nombre, fecha, detalle y saldo antes/después (ledger inmutable).
- Saldo insuficiente ≠ "no" → genera COTIZACIÓN de excedente automática (upsell, no conflicto).
- Créditos sin rollover por defecto (mes cerrado); configurable por contrato.
- Alerta al equipo cuando una marca consume el 80% del saldo antes del día 20.
- Ciclo = ciclo de contrato de la marca (no necesariamente mes calendario).

## 6. Modelo de datos propuesto (MySQL de Tiusdei — nombres sugeridos)
```sql
-- Tarifario: valor por tipo de entregable (histórico versionado)
CREATE TABLE tarifario (
  id CHAR(36) PRIMARY KEY,
  tipo_entregable_id CHAR(36) NOT NULL,  -- FK deliverable_types
  valor_usd DECIMAL(10,2) NOT NULL,
  creditos INT NOT NULL,                  -- si se adopta el modelo de créditos
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE NULL,
  notas VARCHAR(500) NULL
);

-- Entregables contratados por marca (el "Client Hop" vivo)
CREATE TABLE brand_entregables (
  id CHAR(36) PRIMARY KEY,
  brand_id CHAR(36) NOT NULL,             -- FK brands
  tipo_entregable_id CHAR(36) NOT NULL,
  cantidad_mensual INT NOT NULL,
  contrato_inicio DATE, contrato_fin DATE,
  fecha_renovacion DATE,
  fuente VARCHAR(100),                    -- 'contrato-drive' | 'manual'
  drive_file_id VARCHAR(100) NULL
);

-- Ledger de canjes
CREATE TABLE canjes (
  id CHAR(36) PRIMARY KEY,
  brand_id CHAR(36) NOT NULL,
  periodo CHAR(7) NOT NULL,               -- '2026-07'
  pedido VARCHAR(255) NOT NULL,           -- 'Reel adicional — campaña mundial'
  entrega_tipo_id CHAR(36) NOT NULL,      -- lo que se entrega (reel)
  consume JSON NOT NULL,                  -- [{tipo_id, cantidad}] p.ej. 3 posts
  valor_usd DECIMAL(10,2),
  saldo_antes JSON, saldo_despues JSON,
  registrado_por CHAR(36) NOT NULL,       -- FK users
  tiusdei_task_id CHAR(36) NULL,          -- task creada vía MCP
  created_at DATETIME(3)
);
```

## 7. Roadmap
- **Fase 1 (1 día)** — MVP en Tiusdei: 3 tablas + `/convertidor` (elegir marca → saldo del mes → simular canje → registrar). Valores de ejemplo de Juan mientras llega el tarifario real.
- **Fase 2 (1 día)** — Análisis `time_entries` → propuesta de tarifario con costo real por tipo (para la reunión con Iván).
- **Fase 3 (1-2 días)** — IA de Nebula lee contratos del Drive (ya indexados en su cerebro; ej. el Acuerdo de Stevia Life = 15 chunks) → propone `brand_entregables` → confirmación → POST a Tiusdei. Preaprobación de Nebula valida saldo en vivo.
- **Fase 4** — Canje aprobado crea task automática (MCP `create_task`), alertas 80%, reporte mensual de consumo/rentabilidad por marca.

## 8. Referencias técnicas
- Tiusdei: este repo (`/var/www/tiusdei`) — front React+TS+Vite+Tailwind+shadcn, back `server/` Express+MySQL puerto 3003, dominio tiusdei.qbit.ec, PM2 `tiusdei-api` + `tiusdei-mcp`. DB `tiusdei` (credenciales en `server/.env` → `DATABASE_URL`; NO copiarlas a docs). Tablas existentes relevantes: `brands`, `deliverable_types` (catálogo, sin precios), `deliverables` (por task, vacía), `time_entries`, `api_tokens` (MCP).
- Nebula: 147.182.205.212 · `/opt/nebula-alpha` · nebulav2.qbit.ec · Postgres+pgvector · cerebro por cliente con contratos del Drive indexados · módulo Preaprobación de contenido y flujo de aprobación en 2 etapas ya operativos (jul-2026).
- El pitch: **"Cada 'regalito' al cliente queda contabilizado, los excedentes se vuelven cotizaciones, y el tarifario sale de nuestras propias horas trabajadas."**
