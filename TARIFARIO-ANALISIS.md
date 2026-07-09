# Tarifario con datos reales — Análisis de horas de Tiusdei
**Fase 2 del [Convertidor de contenidos](./CONVERTIDOR-PLAN.md) · Generado 7-jul-2026 · Para la reunión con Iván**

## Metodología
- Fuente: `time_entries` (tiempo trackeado, neto de `idle_seconds`, solo entradas `completed`) cruzado con `task_deliverable_types` (941 etiquetas tarea→tipo→cantidad) y `deliverable_types`.
- Ventana: **24-mar-2026 → 06-jul-2026** (~3.5 meses de operación real).
- Métrica: **horas por unidad de entregable** (horas de la tarea ÷ cantidad de unidades etiquetadas). Se usa la **mediana** (robusta a outliers; los promedios vienen inflados por tareas atípicas).

## Resultados (mediana de horas por unidad)

| Tipo | Tareas | Unidades | Mediana h/u | Ratio vs Post |
|---|---|---|---|---|
| Historia | 1 | 1 | 0.11 | 0.17× ⚠ muestra insuficiente |
| **Post (estático)** | 25 | 136 | **0.63** | **1.00× (base)** |
| **Animación (post animado)** | 33 | 57 | **1.08** | **1.71×** |
| **Video** | 19 | 28 | **1.40** | **2.22×** |
| **Reels** | 39 | 77 | **1.56** | **2.48×** |
| Banner Web | 1 | 3 | 2.50 | 3.97× ⚠ muestra insuficiente |
| Carrusel | — | — | — | ⚠ NO EXISTE como tipo en Tiusdei |

## Validación de las intuiciones de Juan
| Intuición de Juan | Dato real | Veredicto |
|---|---|---|
| "Post animado = 2 posts estáticos" | 1.71× | ✅ Muy cerca — su intuición es buena |
| "1 reel = 3 posts" ($60/$20) | 2.48× en horas | ⚠ El costo real es ~2.5, no 3 |

## 🎯 El insight clave para la reunión: canjear por PRECIO sangra horas
Si el canje usa el ratio **comercial** (1 reel = 3 posts) y el cliente cambia **1 reel → 3 posts**, el equipo pasa de 1.56h a 1.89h de trabajo (**+21% de horas por el mismo dinero**). En la dirección contraria (3 posts → 1 reel) la agencia gana horas. Conclusión:
- **Canjes internos** (redistribución de entregables): usar ratios de **COSTO** (horas reales) → el canje queda neutro en carga de trabajo en ambas direcciones.
- **Venta de extras** (contenido adicional facturado): usar el tarifario **COMERCIAL** en $ (ahí el 3× de Juan está bien y deja margen: un reel cuesta ~1.56h ≈ $49 al rate implícito, y se vende en $60).
- Son **dos tablas distintas**: "créditos de canje" ≠ "precio de venta". Mezclarlas es exactamente cómo se fuga la rentabilidad hoy.

## Tarifario de canje propuesto (créditos, ancla: Post = 20)
| Tipo | Créditos | Base |
|---|---|---|
| Historia | 5 | provisional (muestra n=1) |
| Post estático | 20 | dato sólido (136 unidades) |
| Carrusel | 30 | **provisional** — crear el tipo en Tiusdei y medir |
| Post animado | 35 | dato sólido (1.71×) |
| Video corto | 45 | dato sólido (2.22×) |
| Reel | 50 | dato sólido (2.48×) |
| Banner digital | 55 | provisional (muestra n=1) |

## ⚠ Aclaración importante (pregunta de Fadel): el número NO suma la cadena completa
Las tareas en Tiusdei son **departamentales** (114/115 tareas Post pasaron por UN solo departamento): el copy vive en una tarea de CONTENIDO y el arte en otra de DISEÑO. La mediana global por tipo mezcla eslabones sueltos, así que **subestima el costo completo**:

| Eslabón del post | n | Mediana h/u |
|---|---|---|
| Copy (CONTENIDO) | 3 ⚠ | 2.22 |
| Arte (DISEÑO) | 11 | 1.24 |
| **Post completo estimado** | | **~3.4 h** |

En reels el efecto es mayor (3 eslabones: guion + grabación + edición; "Guiones" no cruza con tiempo): AUDIOVISUAL da 0.83 h/u pero la mesa M2 —que trackea reels completos— da **4.66 h/reel** (n=10). Conclusión: los **ratios relativos se sostienen** (reel ≈ 2.5–3× post, con sesgo a favor del 3×), pero los valores absolutos por eslabón suelto son ~1/3 del costo real de la cadena. Para costo/hora y márgenes usar la cadena completa, no el eslabón.

## Caveats y acciones de higiene de datos
1. **Carrusel no existe** como `deliverable_type` — crearlo y etiquetar de aquí en adelante (hoy se camufla como Post o Pieza gráfica).
2. **Reels probablemente subregistrados**: guion/grabación/edición pueden vivir en tareas hermanas sin la etiqueta "Reels" (Guiones no cruza con tiempo). El 2.48× es piso, no techo — refuerza que 3× comercial es sano.
3. Algunas time_entries tienen `idle > duration` (netos negativos) — corregir con `GREATEST(0, …)` en la vista definitiva y auditar el tracker.
4. Historia y Banner tienen n=1 — pedir al equipo etiquetar 4-6 semanas y recalibrar.
5. Para pasar horas → $ falta el **costo/hora cargado por departamento** (dato de Iván): con eso el tarifario comercial también queda basado en datos.

## 📄 EL TARIFARIO REAL (analizado 7-jul-2026)
Fuente: "Tarifario Qbit" (Sheets id `1s7aBENWha0YocX4zJM2CMRZQiSzenKzb`). Hallazgos:

1. **ESTÁ VENCIDO**: vigencia "Junio 2025 – Junio 2026" → la renovación es AHORA y es la ventana perfecta para meter los ítems que faltan.
2. **Faltan justo los formatos del Always-On**: no existen Reel, Carrusel ni Historia. Sí existen: **Diseño de post $75**, **Banner digital $75**, Animación sencilla 30s redes $250, Animación compleja $500, Loop logo $100, guiones ($150–550), adaptación compleja $75 / sencilla $40.
3. Los valores del WhatsApp de Juan ($20 post / $60 reel) eran ejemplos hipotéticos — el tarifario real cobra el post a **$75**.
4. **Las reglas de cambios ya existen** en el tarifario (germen del Convertidor): cambios de color/texto/imagen hasta 3 pedidos sin costo, desde el 4to = 10% del valor inicial; cambio de estructura post-aprobación = 25%.
5. ⚠ **La pestaña "Escenario Equipo CC" (sueldos) NO está vigente** — confirmado por Fadel (7-jul-2026). NO usar sus valores para costo/hora ni márgenes. Pedir a Iván los sueldos cargados actuales; con eso se recalculan costos reales y márgenes en un paso (las horas ya están medidas).

### Tarifas sugeridas para los formatos faltantes (por RATIO de horas × tarifa del post — no dependen de sueldos)
| Formato | Horas (cadena est.) | Tarifa actual | Tarifa sugerida |
|---|---|---|---|
| Post | ~3.4 h | $75 | mantener $75 (ancla) |
| Reel | ~4.7 h | **NO EXISTE** | **$185–190** ($75 × 2.5) |
| Carrusel | sin data | NO EXISTE | **$110–120** provisional (1.5×) |
| Historia | sin data | NO EXISTE | **$25–40** provisional |
| Post animado | ~3.3 h | $250 (animación 30s) | revisar si "post animado" ≠ "animación 30s" |
| Banner digital | ~2.5 h | $75 | mantener |

*Los márgenes reales quedan pendientes del costo/hora actualizado (sueldos vigentes — dato de Iván). Las horas medidas ya están; será multiplicar.*

### Créditos de canje calibrados con el tarifario real (1 crédito = $3.75)
Post $75 = **20 créditos** (ancla) · Banner $75 = **20** · Carrusel ~$112 = **30** · Post animado ~$130 = **35** · Video corto ~$170 = **45** · Reel ~$187 = **50** · Historia ~$20-35 = **5-8**.
→ La tabla de créditos por horas y la de precios CONVERGEN: la propuesta es consistente por costo y por tarifa.

## Preguntas para Iván
1. ~~¿Existe tarifario?~~ SÍ (analizado arriba) — pero VENCIÓ en junio 2026: ¿quién aprueba la renovación y podemos meter Reel/Carrusel/Historia en esa pasada?
2. **Costo/hora cargado ACTUAL por perfil** — los sueldos del Excel ("Escenario Equipo CC") no están vigentes; con el dato real, márgenes y costo por pieza salen solos (horas ya medidas).
3. ¿Los canjes deben ser neutros en horas (costo) o en precio? (recomendación: costo)
4. ¿Excedentes sin saldo → cotización automática? ¿A qué precios?
5. ¿Vigencia del tarifario y quién aprueba cambios?

---
*Query de referencia (recalcular cuando haya más data):* horas netas por tarea desde `time_entries` (status completed, `SUM(GREATEST(0, duration_seconds - idle_seconds))`) ÷ `task_deliverable_types.cantidad`, mediana por `deliverable_types.nombre`.
