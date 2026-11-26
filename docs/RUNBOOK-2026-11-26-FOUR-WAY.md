# RUNBOOK — 26N 2026 · Debate a cuatro

**Sesión oficial:** `f45fc70e-fcb6-4e01-b40b-81143627e030`  
**Fecha/hora:** 2026-11-26 22:00 Europe/Madrid  
**Candidatos:** Pedro Sánchez (PSOE), Santiago Abascal (VOX), Ada Colau (Frente Amplio), Alberto Núñez Feijóo (PP).  
**Emisión oficial:** La 1, Canal 24 Horas, RTVE Play. Fuente: https://www.rtve.es/rtve/20261125/gran-decision-rtve-programacion-especial-por-debate-electoral-a-cuatro-del-26n/17330032.shtml

## Orden oficial útil para calibrar

Apertura: Colau → Sánchez → Feijóo → Abascal.
Cierre / minuto de oro: Sánchez → Abascal → Colau → Feijóo.
Estos órdenes son **pistas de calibración**, no identificaciones automáticas infalibles. No atribuir citas por el contenido, el orden ni el atril si la huella es ambigua.

## Comprobaciones previas (obligatorias)

1. Abrir https://debate-monitor-live.vercel.app/ con cookie de operador autorizada.
2. Seleccionar **26 NOV · Debate a cuatro** y verificar exactamente el UUID oficial arriba.
3. Confirmar Neon conectado; roster exactamente 4 candidatos; CAM++ listo y **al menos 40 huellas de candidatos (10 por candidato)**. Si la disponibilidad real difiere, no dar la voz por certificada.
4. Introducir la clave privada OpenRouter en la consola, nunca en código ni en una URL; **Comprobar OpenRouter**.
5. Precargar CAM++ y comprobar estado del motor; validar que el navegador permite captura de pestaña con audio.
6. Realizar un ensayo SOLO en laboratorio o DEMO aislado, detenerlo, verificar que la cola está vacía y volver a la sesión oficial.
7. Revisar que observatorio y overlay apuntan al debate 26N, no al cara a cara 19N ni al debate a ocho 23N.
8. Verificar mediante captura real de prueba: audio recibido, bloques STT, nombres o «desconocido», cola de claims y evidencias. Ningún contador simulado.
9. No activar Git-to-Vercel desde este repositorio: siguen faltando APIs históricas en GitHub. Un commit en master **no demuestra despliegue**.

## Operación desde 22:00

- Abrir la retransmisión oficial de RTVE Play en una pestaña dedicada.
- Pulsar la opción de captura de la consola y elegir la pestaña RTVE con **Compartir audio** activado. Chrome/Edge requiere permiso humano.
- Mantener la pestaña de operador abierta y despierta: no existe ejecutor independiente de la consola para toda la canalización.
- Procesar transcripción Scribe, CAM++ rápido y verificación asistida sin mezclar sesiones.
- Cinco minutos después de cada tramo, segunda pasada CAM++ basada en WebM temporal RAM y envío de **embeddings** solamente. El 26N exige al menos 40 huellas; otras sesiones conservan mínimo 60. La segunda pasada es aproximada y debe validarse E2E en producción.
- Si hay voz dudosa o solapamiento, dejar SIN IDENTIFICAR y conservar el fragmento temporal. No inventar hablante.
- No publicar una etiqueta de falso/verdadero como revisión humana certificada; mostrar estado provisional, fuente, cita textual y nivel de evidencia.

## Pausas y control de calidad

- Priorizar afirmaciones factuales verificables sobre insultos, promesas, opiniones o predicciones.
- En las pausas, revisar cola pendiente y afirmaciones de alto impacto; las rondas II–V de fuentes tienen límite de llamadas establecido por el código (16), no son ilimitadas.
- Verificar referencias y posibles contradicciones con fuentes primarias y fechas exactas.
- Objetivo de medición: afirmaciones detectadas, verificadas antes de acabar la pausa, pendientes, desconocidos acústicos, latencia mediana y errores STT. No falsear resultados.

## URLs

- Operador: https://debate-monitor-live.vercel.app/
- Observatorio: https://debate-monitor-live.vercel.app/observatorio.html
- Overlay OBS: https://debate-monitor-live.vercel.app/overlay.html?debate=f45fc70e-fcb6-4e01-b40b-81143627e030&transparent=1
- Laboratorio separado: https://debate-monitor-live.vercel.app/prueba.html

En OBS usar Browser Source 1920×1080 para los **gráficos propios**. No incorporar ni redistribuir señal de RTVE sin permiso.

## Incidencias / criterios GO-NO GO

- **GO captura:** operador autorizado + OpenRouter verificado + audio compartido + sesión UUID correcta.
- **GO atribución de voz:** perfiles reales cargados + CAM++ listo + señales acústicas fiables. Si no: STT sí, identificación no.
- **NO GO:** audio en silencio, cola de otra sesión, sesión equivocada o claves incrustadas en frontend.
- Si no aparecen claims: comprobar primero los segmentos y el estado de cola antes de tocar el modelo.
- Si `quality_status` falta en metadatos públicos no descartar las 40 huellas válidas (bug ya resuelto previamente).
- La sesión en Neon, permisos de operador, presencia real de 40 huellas y captura audiovisual **requieren comprobación desde la consola/servicio activo**; el código por sí solo no los acredita.
