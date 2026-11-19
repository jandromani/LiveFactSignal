# Despliegue y estado de migración

## Producción

- Vercel: https://debate-monitor-live.vercel.app
- Observatorio: /observatorio.html
- OBS: /overlay.html
- Vista de acceso privado: /acceso.html?ticket=...

## Estado importante

Este repositorio contiene el frontend completo y los módulos **nuevos** de autenticación, proxy de operador y tarjetas sociales. **Las APIs históricas que preceden a esta migración todavía están desplegadas en Vercel por referencias de artefactos** y no han podido recuperarse íntegramente desde la interfaz disponible.

**No conectes todavía GitHub como fuente única de despliegue automático**: hasta importar esas APIs, un despliegue hecho solo desde este repositorio dejaría sin servicio a la transcripción y la verificación.

Pendientes de portar: `api/live.js`, `api/scribe.js`, `api/scribe-v2.js`, `api/voice.js`, `api/voice-auto.js`, `api/supervisor.js`, `api/catalog.js`, `api/public.js` y `api/monitor.js`.

## Seguridad

- `APP_ADMIN_TOKEN` es un secreto cifrado en Vercel, jamás una constante JavaScript del navegador.
- `DATABASE_URL` también está cifrada.
- Un enlace de activación de un uso crea una cookie firmada, `Secure; HttpOnly; SameSite=Lax`, válida 30 días.
- Solo la ruta `/api/operator-proxy` puede inyectar el secreto administrador a los endpoints antiguos, después de validar la cookie.
- `operator_invites` conserva hashes SHA-256 de invitaciones temporales en Neon, nunca tickets en claro.
- La clave OpenRouter se introduce en memoria y se envía exclusivamente mediante HTTPS.

## Pruebas

1. Sin cookie, `POST /api/operator-proxy?route=catalog&action=prepare` debe responder 401.
2. Con cookie válida y un ID inválido debe responder 400 desde el backend, prueba de la autenticación servidor-a-servidor.
3. `GET /api/og` debe devolver una imagen PNG válida de 1200×630.
4. `GET /api/share?claim=<id>` debe devolver metadatos Open Graph/Twitter y reenviar al observatorio.
5. `GET /api/public?debate=<id>` no debe exponer debates QA ni claims excluidas.
6. Captura real: requiere Chrome/Edge, permiso explícito de audio y una clave OpenRouter.

No distribuyas señales audiovisuales de terceros sin autorización.
