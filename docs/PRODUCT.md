# DEBATE / SIGNAL · Producto

## Experiencia del operador

1. Elegir un debate ya programado.
2. Introducir solo la clave OpenRouter.
3. Abrir RTVE Play o YouTube y compartir el sonido de su pestaña.

El modo predeterminado utiliza Scribe v2, bloques de 12 s, huellas CAM++, 20 verificadores disponibles y vigilancia continua. La contraseña administrativa se sustituye por una sesión privada activada una sola vez.

## Tres vistas

- **Operador:** captura, estado, fuentes y controles avanzados opcionales.
- **Observatorio público:** tarjetas por candidato, feed de afirmaciones, radar temático y fuentes individuales.
- **Realización:** capa visual para OBS, sin necesidad de retransmitir vídeo de RTVE.

## Distribución orgánica

- Metadatos OG/Twitter para la portada y el observatorio.
- Imagen PNG dinámica de 1200×630 para enlaces compartidos.
- `/api/share?claim=<uuid>` con título, cita y tarjeta de la afirmación.
- Las etiquetas automatizadas siempre son provisionales.

## Competencia y próximos hitos

**Factiverse Live** — transcripción, extracción y evidencia en directo.
**Full Fact AI** — detección de afirmaciones repetidas, prioridades editoriales y monitorización histórica.
**Factiverse Gather** — integración con vídeo y archivo de afirmaciones.

Pendiente de implementar o validar completamente:

- Detección de afirmaciones equivalentes entre debates con similitud semántica auditada, no solo coincidencias temáticas.
- Monitorización autónoma y recuperación tras caídas con el navegador cerrado.
- Sistema de revisión humana y rectificaciones versionadas.
- Alertas de verificación priorizadas y seguimiento de fuentes primarias (INE, BOE, Eurostat).
- Prueba ciega de identidad de voz con audio de un debate nunca usado en la calibración.
- Telemetría económica y límites por debate para OpenRouter y búsquedas.
