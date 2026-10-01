# Implementación en curso

Estado al 1 de octubre de 2026. Este documento describe lo que funciona en el repositorio; [PRODUCTO.md](PRODUCTO.md) define el alcance del piloto. Aún no está listo para usar con datos reales de la cocina.

## Base ejecutable

| Área | Estado comprobado | Falta para el piloto |
| --- | --- | --- |
| Cliente y diseño | Vite, React/TypeScript y PWA. `src/styles.css` es el CSS del mock aprobado copiado sin cambios (solo se quitó el ámbito `#brigade-v2`); cada vista usa su marcado `b2-*` e iconos Lucide. Las extensiones para datos reales están al final del archivo y usan los mismos tokens. Recarga sin red comprobada en Chromium móvil. | Probar Safari en el iPhone del tester y Android real; pulir todos los estados y campos. |
| Identidad y equipo | Better Auth sobre D1, alta pública cerrada, configuración inicial con token, sesiones, roles de chef/sous chef/commis, invitaciones por enlace. | Recuperación de cuenta, operación de producción, administración completa de integrantes. |
| Entrada temporal sin cuenta | La app abre el cuaderno local por defecto. Incluye las diez recetas completas de la carta inicial pública de B-B-Chef, disponibles sin sesión ni llamadas a la API. | Restablecer un ingreso confiable en el iPhone real y migrar los cambios hechos en el cuaderno local antes de volver a exigir cuenta. |
| Recetas | Alta manual con ingredientes y pasos, lectura privada, acceso a todo el equipo o a integrantes elegidos; esquema de versiones. | Edición/versionado, archivo, conservación de originales y traslado controlado de las recetas heredadas. |
| Producción | Plan con receta y rendimiento, evento opcional, registro de tandas, operaciones idempotentes. Commis registra solo en producción con tarea asignada. Cada tanda descuenta del stock el bruto de los ingredientes vinculados, en el mismo batch D1 e idempotente por tanda; si el stock registrado no alcanza, queda en 0 sin rechazar la tanda. | Interfaz de asignación, historial de versión de receta completo y resolución de conflictos. |
| Sin conexión | IndexedDB para recetas, eventos y producciones consultados; cola local de tandas con identificador estable y reintento al volver la red. | Borradores de recetas sincronizables, migración de datos locales al usuario, controles de acceso al caché y tratamiento completo de conflictos. |
| Eventos | Alta, consulta y edición básica; vínculo opcional con una producción. | Relaciones y vistas completas, validación de fechas y permisos de edición detallados. |
| Stock | Catálogo de ingredientes por cocina y unidad base; saldos derivados de movimientos, historial, entradas, consumos y ajustes. D1 bloquea saldos negativos; una operación repetida no se duplica. Lectura con caché sin red. | Lotes/vencimientos, ubicaciones y cola offline de movimientos. Las escrituras actuales requieren conexión. |
| Requerimientos | Ingredientes de receta vinculados al catálogo: automático por nombre y unidad compatible (kg→g, L→ml) o elegido en la receta; unidades incompatibles se rechazan. `GET /requirements` suma lo pendiente de las producciones abiertas con merma, descuenta stock y pedidos en borrador, enviados o confirmados (`shared/requirements.ts`). Pedidos crea un borrador con los faltantes elegidos. | Proveedor sugerido por ingrediente. |
| Compras | Proveedores, pedidos por proveedor con líneas de ingredientes identificados, borrador, compartir texto, confirmación explícita de envío, confirmación del proveedor y recepciones parciales. Las recepciones suman al stock en una operación D1; reintentos usan ID estable. | Elegir proveedor por catálogo, precios, edición de borradores, envío integrado al canal concreto y prueba en iPhone real. |
| Captura por foto o texto | Recetario → Capturar: una foto se achica en el teléfono (lado mayor 1600 px), `worker/transcribe.ts` la transcribe con `@cf/meta/llama-4-scout-17b-16e-instruct` (respaldo `@cf/mistralai/mistral-small-3.1-24b-instruct`) y el texto queda editable antes de interpretar; "[?]" marca lo ilegible y esa cantidad siempre se pregunta. El texto pegado o transcripto pasa por Workers AI (`@cf/qwen/qwen3-30b-a3b-fp8`, `worker/capture.ts`) y `shared/capture.ts` normaliza lo que devuelve el modelo, que se trata como no confiable. Faltante de rendimiento, cantidad o procedimiento siempre genera pregunta. Rendimiento sugerido de forma determinística (piezas por peso de masa, "p/ 40 porc"). El procedimiento que propone el modelo queda marcado como sugerido y el chef lo acepta, edita o descarta. Revisión final en el formulario de receta con confirmación obligatoria. | Historial de capturas y conservación del original. |
| Cursos de la carta | Recetario agrupado por curso: Entradas, Principales y Postres fijos; la jefatura agrega cursos propios (`kitchen_courses`, máx. 20). Curso opcional por receta (`recipes.course`), elegible al crear o desde el detalle por el autor o la jefatura; lo que no tiene curso va a "Sin curso". | Reordenar y renombrar cursos. |
| Tareas | Esquema inicial, sin operación completa. | API e interfaz. |

El Worker está separado en `worker/auth.ts`, `permissions.ts`, `recipes.ts`, `production.ts`, `members.ts`, `events.ts`, `inventory.ts` y `purchases.ts`. Las migraciones D1 están en `migrations/0001` a `0006`. `shared/kitchen.ts` concentra cantidades enteras en milésimas, rendimiento y merma; la producción fija el ID de la versión de receta utilizada. Los secretos de desarrollo viven en `.dev.vars` ignorado por Git; `.dev.vars.example` contiene solo nombres de variables.

El prototipo anterior CRA/Supabase se preserva sin ejecutar en `legacy/brigade-cra/`. El `vercel.json` de la raíz sí está activo para publicar el frontend y conectar `/api/*` al Worker. No se migraron datos de una instancia Supabase real. Como salida temporal al problema de ingreso del tester, `src/App.tsx` inicia en modo local incluso si el navegador conservaba una identidad anterior. `src/data/bbchef-starter.json` contiene diez recetas derivadas de `CARTA_INICIAL` de B-B-Chef, sin correo, ID de usuario ni ID de cocina; se muestran junto a las recetas propias del navegador sin sobrescribirlas. Las dos recetas incompletas del origen siguen pendientes. El cuaderno local no se sincroniza ni tiene respaldo en D1. La cuenta, las recetas privadas remotas y las reglas de autenticación de `/api/*` permanecen intactas; el ingreso con cuenta sigue disponible desde Conexión.

Despliegue: API y datos en Cloudflare (Worker `brigade.bertinisdnd.workers.dev`, D1 remota `brigade`, secreto `BETTER_AUTH_SECRET`). La primera cocina ya existe y `BOOTSTRAP_TOKEN` no está configurado, por lo que el alta inicial queda deshabilitada. El frontend se publica en Vercel (proyecto `brigade`, dominio `brigade.bertinilabs.xyz`). `vercel.json` compila Vite y reescribe `/api/*` al Worker, así la sesión queda en el mismo origen que la app. `PUBLIC_ORIGIN` en `wrangler.jsonc` lista los orígenes aceptados por Better Auth; en local se sobrescribe desde `.dev.vars`. El workflow `Brigade CI` ejecuta instalación reproducible, pruebas y compilación en cada PR. El Worker sirve la versión `113465cd-2c7b-4562-94c5-8502af776df5` desde el 01/10/2026; la D1 remota no tiene migraciones pendientes. Salud y rechazo de acceso sin sesión se comprobaron en ambos dominios.

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
- Requerimientos (API local, 17 comprobaciones): vínculo automático kg→g, rechazo g→ml, 40 porciones → 7,5 kg bruto de calabaza con 20 % de merma, faltante 2,5 kg contra 5 kg de stock, borrador que evita pedir dos veces, y tras una tanda de 20 solo cuenta la mitad pendiente.
- Diseño: recorrido de 13 pantallas con datos reales a 320, 390 y 1280 px contra el mock aprobado; sin desbordes ni errores de página.
- `npm audit` tras actualizar Vitest: cero alertas. Las pruebas unitarias usan `vitest.config.ts` para aislar cálculos del Worker.
- Los servidores de vista previa se detuvieron después de cada prueba. Capturas y scripts de comprobación están en `work/` del workspace de la sesión, fuera de Brigade.

Estas pruebas de interfaz usan Chromium; faltan Safari y Android reales. Los datos D1 usados fueron de prueba, no una cocina del usuario. La base se revisó en el [PR #2](https://github.com/Joabertini/Brigade/pull/2) y la captura por foto se fusionó en el [PR #6](https://github.com/Joabertini/Brigade/pull/6). El despliegue y las comprobaciones públicas del 01/10 están registrados en la [hoja de sesión](sesiones/2026-10-01.md).

## Riesgos y próximos módulos

1. Impedir que errores 401/403 parezcan cortes de red y oculten revocaciones tras una caché previa.
2. Vincular recetas al catálogo, calcular requerimientos sin mezclar unidades, sugerir agrupación por proveedor y completar tareas independientes de eventos.
3. Conservar el original de cada captura, admitir varias imágenes por receta y repetir la evaluación con fotos reales del chef; la transcripción e interpretación con confirmación humana ya funcionan.
4. Completar edición/versionado, conciliación offline, permisos, recuperación de cuenta y pruebas en dispositivos reales.

## Fuentes técnicas consultadas

- [Cloudflare: React SPA con API Worker y Vite](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)
- [Cloudflare: migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare: secretos en Vite](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)
- [Vite PWA: registro del service worker](https://vite-pwa-org.netlify.app/guide/register-service-worker)
- [Better Auth: Hono](https://better-auth.com/docs/integrations/hono)
- [Better Auth: D1](https://better-auth.com/blog/1-5)
- [WebKit: Web Share en Safari](https://webkit.org/blog/8718/new-webkit-features-in-safari-12-1/)
- [Vercel: desactivar despliegues Git](https://vercel.com/docs/project-configuration/git-configuration)
