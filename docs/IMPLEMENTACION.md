# Implementación en curso

Estado al 30 de septiembre de 2026. Este documento describe lo que funciona en el repositorio; [PRODUCTO.md](PRODUCTO.md) define el alcance del piloto. Aún no está listo para usar con datos reales de la cocina.

## Base ejecutable

| Área | Estado comprobado | Falta para el piloto |
| --- | --- | --- |
| Cliente y diseño | Vite, React/TypeScript y PWA; navegación inferior fija, tarjetas y tipografía según la revisión 02. Recarga sin red comprobada en Chromium móvil. | Probar Safari en el iPhone del tester y Android real; pulir todos los estados y campos. |
| Identidad y equipo | Better Auth sobre D1, alta pública cerrada, configuración inicial con token, sesiones, roles de chef/sous chef/commis, invitaciones por enlace. | Recuperación de cuenta, operación de producción, administración completa de integrantes. |
| Recetas | Alta manual con ingredientes y pasos, lectura privada, acceso a todo el equipo o a integrantes elegidos; esquema de versiones. | Edición/versionado, archivo, captura por imagen, revisión culinaria y traslado controlado de las recetas heredadas. |
| Producción | Plan con receta y rendimiento, evento opcional, registro de tandas, operaciones idempotentes. Commis registra solo en producción con tarea asignada. | Interfaz de asignación, consumo de stock, historial de versión de receta completo y resolución de conflictos. |
| Sin conexión | IndexedDB para recetas, eventos y producciones consultados; cola local de tandas con identificador estable y reintento al volver la red. | Borradores de recetas sincronizables, migración de datos locales al usuario, controles de acceso al caché y tratamiento completo de conflictos. |
| Eventos | Alta, consulta y edición básica; vínculo opcional con una producción. | Relaciones y vistas completas, validación de fechas y permisos de edición detallados. |
| Stock | Catálogo de ingredientes por cocina y unidad base; saldos derivados de movimientos, historial, entradas, consumos y ajustes. D1 bloquea saldos negativos; una operación repetida no se duplica. Lectura con caché sin red. | Vincular ingredientes de recetas, lotes/vencimientos, ubicaciones y cola offline de movimientos. Las escrituras actuales requieren conexión. |
| Compras | Proveedores, pedidos por proveedor con líneas de ingredientes identificados, borrador, compartir texto, confirmación explícita de envío, confirmación del proveedor y recepciones parciales. Las recepciones suman al stock en una operación D1; reintentos usan ID estable. | Sugerir faltantes desde producción, elegir proveedor por catálogo, precios, edición de borradores, envío integrado al canal concreto y prueba en iPhone real. |
| Tareas, OCR e IA | Esquema inicial de algunas entidades, sin operación completa. | Implementar estos módulos centrales. |

El Worker está separado en `worker/auth.ts`, `permissions.ts`, `recipes.ts`, `production.ts`, `members.ts`, `events.ts`, `inventory.ts` y `purchases.ts`. Las migraciones D1 están en `migrations/0001` a `0006`. `shared/kitchen.ts` concentra cantidades enteras en milésimas, rendimiento y merma; la producción fija el ID de la versión de receta utilizada. La base D1 de `wrangler.jsonc` tiene un ID marcador para desarrollo local: se debe crear una remota antes de desplegar. Los secretos de desarrollo viven en `.dev.vars` ignorado por Git; `.dev.vars.example` contiene solo nombres de variables.

El prototipo anterior CRA/Supabase y `vercel.json` se preservan sin ejecutar en `legacy/brigade-cra/`. No se migraron datos de una instancia Supabase real. El modo local de la nueva interfaz es útil para comprobar flujos, pero sus datos pertenecen a ese navegador y no tienen respaldo en D1.

## Correspondencia con B-B-Chef

| Fuente | Destino actual | Trabajo pendiente |
| --- | --- | --- |
| Multiplicación por tandas y lista de producción (`bertini-app.html` 1015–1018, 1175–1299) | `shared/kitchen.ts`, `ProductionView.tsx` | Agrupación de compras, costos y conversiones de envases. |
| Carta editable (`bertini-app.html` 794–1009, 1061–1165) | `RecipesView.tsx` y API de recetas | Edición, archivo, versiones y evaluación de las 12 recetas iniciales. |
| Timeline de tareas (`bertini-app.html` 1303–1355) | Esquema `tasks` en D1 | API e interfaz independientes de eventos. |
| Eventos (`bertini-app.html` 1659–1995) | `events.ts` y `EventsView.tsx` | Campos y relaciones que requiera la operación real. |
| Stock y compras del Brigade original | Tablas iniciales de proveedores/pedidos | Movimientos, faltantes, catálogo, agrupación y preparación de envío. |

Las recetas heredadas tienen rendimientos descriptivos o ingredientes sin cantidad. Requieren revisión del chef antes de ser escalables.

## Verificación realizada

- `npm test`: cuatro casos de cálculo de rendimiento, merma, faltante y formato.
- `npm run build`: TypeScript, Worker, cliente y service worker.
- `npm run db:migrate:local`: seis migraciones D1 aplicadas en desarrollo.
- Pruebas de API local: sesión y alta pública cerrada, aislamiento por cocina, receta privada/compartida, invitación, permisos de commis, producción y reintento idempotente.
- Flujos de navegador automatizado a 390 × 844: modo local, ingreso con cuenta, receta y producción, corte y retorno de red con sincronización, invitación y compartir, evento y vínculo de producción. Sin desborde horizontal ni errores de página en esas rutas.
- Inventario en API y pantalla móvil: ingrediente duplicado 409, entrada 201, reintento de la misma operación 200 sin duplicación, consumo 201, saldo negativo 409, otra cocina 403 y saldo esperado visible sin desborde.
- Compras en API y pantalla móvil: proveedor y pedido 201, repetición del pedido 200, cambio de contenido con el mismo ID 409; recepción parcial 201 y repetición 200, exceso 409, cierre al completar líneas y saldos de stock 100 g/200 ml. Sin errores de página ni desborde a 390 px. El menú nativo de compartir sigue pendiente de comprobación en el iPhone real.
- Compartir receta con integrantes del mismo nombre: el selector del chef incluye email para distinguirlos; la prueba repitió invitación, acceso individual y ausencia de acción de planificación para commis.
- `npm audit` tras actualizar Vitest: cero alertas. Las pruebas unitarias usan `vitest.config.ts` para aislar cálculos del Worker.
- Los servidores de vista previa se detuvieron después de cada prueba. Capturas y scripts de comprobación están en `work/` del workspace de la sesión, fuera de Brigade.

Estas pruebas usan Chromium; faltan Safari y Android reales. Los datos D1 usados fueron de prueba, no una cocina del usuario. La base se publicó para revisión en el [PR draft #2](https://github.com/Joabertini/Brigade/pull/2); no hay despliegue de Brigade en Cloudflare ni merge.

## Riesgos y próximos módulos

1. Impedir que errores 401/403 parezcan cortes de red y oculten revocaciones tras una caché previa.
2. Vincular recetas al catálogo, calcular requerimientos sin mezclar unidades, sugerir agrupación por proveedor y completar tareas independientes de eventos.
3. Incorporar captura de imágenes, conservación del original, OCR y modelo de interpretación culinaria con confirmación humana obligatoria para dudas.
4. Completar edición/versionado, conciliación offline, permisos, recuperación de cuenta y pruebas en dispositivos reales.

## Fuentes técnicas consultadas

- [Cloudflare: React SPA con API Worker y Vite](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)
- [Cloudflare: migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare: secretos en Vite](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)
- [Vite PWA: registro del service worker](https://vite-pwa-org.netlify.app/guide/register-service-worker)
- [Better Auth: Hono](https://better-auth.com/docs/integrations/hono)
- [Better Auth: D1](https://better-auth.com/blog/1-5)
- [WebKit: Web Share en Safari](https://webkit.org/blog/8718/new-webkit-features-in-safari-12-1/)
