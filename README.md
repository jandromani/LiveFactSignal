# LiveFactSignal · DEBATE / SIGNAL

Observatorio de debates electorales con transcripción, identificación acústica experimental, verificación asistida por IA y visualizaciones públicas.

**Producción:** https://debate-monitor-live.vercel.app  
**Operador:** https://debate-monitor-live.vercel.app/  
**Observatorio:** https://debate-monitor-live.vercel.app/observatorio.html  
**Realización OBS:** https://debate-monitor-live.vercel.app/overlay.html

## Prueba inmediata: dos botones

- **DEMO:** un vídeo real de YouTube (mejores momentos Sánchez–Feijóo, 10/07/2023) precargado en la consola. Sesión QA separada de Neon y cuatro huellas de voz listas. Pulsar «Reproducir y escuchar», conceder audio y validar datos reales.
- **HOY · 22:00:** conmuta a la sesión oficial sin perder la clave OpenRouter en memoria ni mezclar los fragmentos de la demo. Abre RTVE Play y comparte su audio cuando comience el debate.

El permiso de captura de pantalla/audio de Chrome o Edge requiere una acción explícita; ningún navegador seguro permite concederlo silenciosamente.

## Arquitectura

- **Vercel:** frontend, captura del navegador y endpoints de servidor.
- **Neon PostgreSQL:** debates, participantes, perfiles acústicos, fragmentos y afirmaciones.
- **OpenRouter:** transcripción Scribe v2 y análisis GPT-6 Luna. La clave se introduce en el navegador y no se guarda en GitHub.
- **Acceso de operador:** sesión HttpOnly con activación de un solo uso. APP_ADMIN_TOKEN permanece como variable cifrada del servidor.

## Precauciones

Los veredictos y las atribuciones de voz son **provisionales**: no deben presentarse como comprobaciones editoriales humanas. No redistribuir señales audiovisuales de terceros sin autorización.

## Estado de la migración

Este repositorio se ha inicializado para centralizar el desarrollo. Los archivos estáticos, las nuevas APIs de operación y OG se versionan aquí. **Las APIs históricas que preceden a esta migración continúan desplegadas en Vercel por referencias de despliegue**; antes de activar la integración Git-to-Vercel habrá que incorporarlas completamente al repositorio y pasar pruebas de regresión. No cambies la fuente de despliegue a GitHub hasta completar esa importación.

Nunca añadas `DATABASE_URL`, `APP_ADMIN_TOKEN`, `OPENROUTER_API_KEY` ni claves privadas al código fuente.
