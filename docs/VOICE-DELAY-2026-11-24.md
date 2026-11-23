# LiveFactSignal · Segunda pasada acústica (5 minutos)

**Sesión de referencia:** `21e5098f-0f04-4571-92a4-9b1d52f4d48c` · debate a ocho.

## Por qué

El motor CAM++ V2 ya identificaba siete de ocho candidatos en la captura real, pero no produjo ninguna coincidencia confirmada de Míriam Nogueras. La biblioteca contiene sus diez referencias. Algunos intervalos de 3–5 segundos fueron rechazados por umbral o margen; no procede forzar identidades ni atribuir las citas basándose en su contenido.

## Arquitectura desplegada

1. La captura habitual sigue funcionando sin cambios: audio → Scribe STT → afirmaciones y CAM++ rápido.
2. En paralelo, `voice-delay.js` conserva cada fragmento WebM **solo en RAM de la pestaña** durante aproximadamente cinco minutos. No se envía audio crudo al backend ni se persiste.
3. Transcurrido el retraso, se calculan localmente huellas CAM++ de ventanas cortas de 4,7 s solapadas cada 3 s, o intervalos limpios de Scribe si existen. Se descarta el WebM tras procesarlo.
4. `api/voice-delayed.js` recibe exclusivamente huellas normalizadas y tiempos, agrupa fragmentos sin nombres por similitud acústica, calcula centroides por grupo y compara cada grupo frente a **todos** los candidatos del debate, no solo Nogueras.
5. Se requiere evidencia de al menos dos segmentos STT distintos, >=14 segundos agregados, similitud de grupo >=0,75, segundo apoyo >=0,67, margen >=0,17, y comprobaciones individuales adicionales. Sin ese consenso se deja como **desconocido**.
6. Los intervalos contiguos confirmados se reúnen dentro de cada fragmento para atribuir una afirmación solo cuando coinciden al menos un 80% de su intervalo temporal; las identificaciones manuales o de la primera pasada no se sobrescriben. Los casos con nombres en conflicto se descartan.
7. Las observaciones se guardan idempotentemente con el método `campplus-delayed-5m` en `voice_match_events`, mediante un índice único específico.

**Diagnóstico visible:** `SEGUNDA PASADA · retraso 5 min` dentro de la galería de voces. Se muestra el número de fragmentos en memoria, huellas pendientes, comparaciones, citas actualizadas y candidatos Nogueras confirmados o pendientes.

## Pruebas realizadas

- El clasificador agrupó muestras de distintas fuentes de Míriam Nogueras (3 segmentos) y Ester Muñoz (3 segmentos), identificando sus grupos correctamente cuando se excluyeron dichas fuentes de las referencias de comparación.
- Los mismos algoritmos dejaron sin identificar ventanas aisladas sin continuidad.
- La prueba JS con reloj simulado confirmó **cero** peticiones antes del retraso de cinco minutos y envío posterior exclusivamente de huellas, sin WebM.
- La prueba JS de segunda pasada simuló tres ventanas por audio de diez segundos (4.7 s, 4.7 s y 4.0 s) y verificó que el blob se libera al terminar.
- El SQL real de la nueva ruta se ejecutó en Neon con un lote vacío y resultado `saved=0, recognized=0, claims_changed=0`, sin escritura.

## Límites reales

- Requiere una pestaña del operador abierta, con el modelo CAM++ precargado. Si el navegador se recarga o se cierra, las muestras WebM y huellas pendientes desaparecen.
- La latencia es aproximadamente **5 minutos más la cola de cómputo del navegador**; no un SLA de cinco minutos exactos.
- No se pueden rescatar tramos históricos anteriores al despliegue si no se conservó el audio original. Se necesita reproducir la fuente o capturar nueva emisión.
- La agrupación por embeddings y ventanas solapadas es una **segunda diarización acústica aproximada**, no separación de fuentes físicas ni garantía de identificar todas las voces simultáneas.
- El procesamiento se activa para sesiones con al menos 60 referencias CAM++; no se fuerza Nogueras cuando los datos son ambiguos.
- Aún falta certificar el recorrido E2E con audio real del debate a ocho; las pruebas de código y la disponibilidad HTTP no sustituyen esa prueba.

## Componentes

- `voice-delay.js`: galería RAM y extracción de ventanas después de cinco minutos.
- `voice-panel.js`: comparte huellas con la vía lenta sin bloquear la comparación rápida.
- `index.html`: entrega audio de transcripciones a la vía lenta y muestra diagnóstico.
- `api/voice-delayed.js`: clusters, evaluación contra los ocho, registros, unión segura de intervalos y atribución a citas.
- `migrations/20261119_acoustic_bootstrap.sql`: índice parcial único `lfs_voice_delay_five_min_unique`.
