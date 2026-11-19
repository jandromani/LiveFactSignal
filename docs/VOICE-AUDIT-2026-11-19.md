# Auditoría del subsistema de voces — 19 noviembre 2026

## Alcance
Recorrido completo: alta de debate en Neon → registro de participantes → herencia de referencias → Scribe v2 y tramos de diarización → CAM++ on-device → contraste acústico → actualización de afirmaciones → observatorio.

**Advertencia editorial:** la biblioteca contiene referencias "source-labeled". `verified_identity=false` en la biblioteca original: se ha identificado la fuente que etiqueta el audio, pero no se ha validado personalmente cada clip. Las coincidencias acústicas son provisionales.

## Causas raíz confirmadas
1. **Dos caminos de alta sin contrato común.** `api/reset` copiaba roster y referencias; el antiguo botón genérico `api/live?action=create` creaba sesiones sin roster. En Neon aparecieron sesiones con 0 huellas y 0 personas aunque la original tenía 12 huellas. **Solución:** triggers `lfs_auto_roster_on_live_run` (debates derivados del encuentro actual) y `lfs_seed_voice_reference_on_roster` (cualquier candidato registrado); operación idempotente, solo referencias etiquetadas.
2. **Estado de voces dependiente de JavaScript.** La inicialización esperaba el chequeo periódico y mezclaba el listado vocal con la respuesta del supervisor: una consulta fallida podía impedir cargar la galería. **Solución:** lista de perfiles independiente, lectura inmediata por sesión, reintento, botón genérico con precarga de plantilla y diagnóstico separado.
3. **Autoaprendizaje de identidades peligroso.** El antiguo `voice-autopilot.js` reemplazaba `window.debateVoice.processChunk` y creaba perfiles a partir de anuncios de turno, que pueden ser imprecisos. **Solución:** desactivar y dejar de cargar ese script; usar solo perfiles `public-reference/source-labeled` y procesamiento acústico por intervalos.
4. **Se descartaba toda una réplica si coexistían varias voces.** El cliente exigía `speaker_count===1` y tramos de 6,5 segundos dentro de fragmentos de 10 segundos. **Solución:** analizar cada tramo individual de al menos 2,8 s, omitir solapamientos sustanciales con otra voz; mono limpio puede aprovechar el fragmento completo.
5. **Actualizaciones demasiado amplias o desfasadas.** Las asignaciones antiguas podían contaminar varias frases de un mismo bloque. **Solución:** `api/voice-match-v2` verifica debate, secuencia, límites reales del audio y coincidencia temporal ≥80% sobre cada afirmación del fragmento; exige score alto, ventaja sobre la segunda voz y dos muestras por candidato. Respeta cualquier identidad ya asignada; no la sobrescribe.
6. **Afirmaciones procesadas más tarde.** El verificador puede crear afirmaciones después de la coincidencia acústica. **Solución:** `api/voice-reconcile` reproduce los intervalos guardados y solo rellena identidades aún desconocidas con una fuente acústica no ambigua.
7. **Carreras al cambiar de sesión.** El antiguo cliente enviaba algunos resultados pendientes al ID leído en `localStorage` al finalizar, en lugar del ID original. **Solución:** cada trabajo lleva un identificador inmutable y se abandona si la sesión cambió.
8. **Observatorio y consola podían señalar sesiones distintas.** El apuntador `debate_reset_state.current_id` solo cambiaba al pulsar Reset, no con Crear sesión. **Solución:** `api/session-activate` y actualización explícita del apuntador al crear una nueva captura oficial.

9. **Sesiones genéricas no publicadas.** `api/public` exigía que la sesión estuviera en `debate_calendar`, pero `api/live?action=create` no copiaba ese registro. Resultado observado: sesión con 4 huellas y 36 afirmaciones, pero HTTP 404 en su API pública. **Solución:** el trigger de alta clona también el calendario del evento original; `api/voice-seed` copia el calendario del debate plantilla para nuevos eventos y `api/reset` admite esta clonación idempotente. Sesiones anteriores reparadas.

## Datos reales auditados
- Captura original: 267 bloques; 12 perfiles (4 referencias de biblioteca + perfiles provisionales de autocalibración); 340 afirmaciones.
- Capturas posteriores: 17/31/31 bloques, inicialmente sin roster/huellas según la ruta; fueron reparadas con el roster correcto y 4 referencias cada una.
- Biblioteca: 2 muestras por persona para Pedro Sánchez y Alberto Núñez Feijóo; modelo de 192 dimensiones `sherpaw-campplus-zh-en-advanced@5fc23543`.
- Consistencia intrapersona: cosenos Feijóo 0,911 y Sánchez 0,937. Cosenos entre personas: 0,115–0,249. **No equivalen a precisión real de clasificación.**

## Protocolo de atribución V2
- Capturar 10 segundos a 32 kb/s; transcribir con Scribe v2.
- Recuperar `voice_spans`, normalizar inicio y fin al fragmento STT y separar por `speaker_key`.
- No atribuir si el fragmento es mixto sin tramos fiables, el tramo es inferior a 2,8 s o hay solapamiento >450 ms entre dos voces.
- Obtener embedding CAM++ local del tramo, sin guardar audio crudo.
- Solo comparar referencias etiquetadas del roster de la sesión, con al menos dos por candidato.
- Umbral coseno medio ≥0,74 (≥0,80 para audio menor de 4,5 s); margen sobre segundo candidato ≥0,14 (≥0,17 en audio corto). Exigir también que la segunda referencia del mejor candidato no sea demasiado baja.
- Persistir evento acústico con índice idempotente por sesión/secuencia/intervalo.
- Actualizar `claims` únicamente si `speaker_origin='unknown'`, `source_type='audio_scribe'`, etiqueta local de fragmento coincide y ≥80% de la afirmación cae en el tramo.
- Si faltan referencias, hay discrepancia o solapamiento entre candidatos: `unknown`, sin inventar hablante.
- La reconciliación solo aplica eventos `campplus-v2-span` ya guardados.

## Pruebas realizadas
- Neon: alta de captura derivada → 3 participantes, 4 referencias y 1 registro público del calendario, prueba transaccional con rollback.
- Neon: alta de un candidato del debate parlamentario → 2 referencias, prueba transaccional con rollback.
- SQL: inserción de evento vocal + actualización de afirmación de la secuencia correcta → 1 cambio, rollback.
- SQL: reconciliación tardía de evento y afirmación → 1 cambio, rollback.
- Neon: ejecución completa de la sentencia del reinicio (incluyendo el apuntador de la sesión activa) → 3 participantes, 4 referencias y 1 registro público; rollback correcto.
- Vercel: la API pública de la captura previamente rota pasó de HTTP 404 a HTTP 200 tras registrar su calendario.
- Seguridad: ninguna de las pruebas de rollback dejó filas persistentes.
- Modelo: las cuatro referencias conocidas dieron 4/4 etiquetas esperadas; una mezcla sintética y una huella alterada quedaron sin clasificar.
- Código: validación sintáctica y compilación Vercel de vista previa.
- **Pendiente:** prueba E2E con audio real de navegador, incluyendo exactitud de atribuciones, tasas de abstención y errores con turnos simultáneos. Un build READY no prueba precisión editorial.

## Operación y diagnóstico
La consola muestra: ID de sesión, candidatos con huellas, número de tramos CAM++ comparados/identificados, afirmaciones atribuidas por voz, afirmaciones desconocidas. `/api/voice-health?id=UUID` devuelve estos metadatos solo a un operador autorizado. `/api/voice-seed` permite recuperar referencias si un evento dispone de roster pero carece de huellas.

La etiqueta **«coincidencia acústica» es provisional**, y no debe presentarse como identificación inequívoca. Es imposible etiquetar retrospectivamente con seguridad las afirmaciones de capturas que no guardaron audio ni eventos acústicos: habría que volver a reproducir el material.

## Riesgo estructural pendiente
Varios endpoints del backend histórico viven en Vercel pero no constan en GitHub. Se mantienen por SHA al desplegar. Conviene recuperar su código completo en el repositorio para disponer de reproducibilidad y pruebas de integración de extremo a extremo; hasta entonces esta auditoría combina inspección del frontend y código nuevo con datos y pruebas SQL del backend real.
