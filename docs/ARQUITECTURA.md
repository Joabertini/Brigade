# Arquitectura propuesta para Brigade

## Estado de partida

El commit `d1fd62c` contiene React 18 con `react-scripts`, un cliente Supabase REST/WebSocket escrito a mano, login y perfiles, tareas ligadas al primer evento, stock de solo lectura, turnos de solo lectura y pantallas `commis` sin flujo conectado. No hay backend de negocio propio ni esquema/migraciones en el repositorio. El destino acordado es Cloudflare, sin Supabase. Se revisará si existen datos reales antes de reemplazar conexiones; no se asume que las vistas existentes estén listas para el piloto.

## Stack recomendado

| Capa | Decisión | Motivo |
| --- | --- | --- |
| Cliente | React + TypeScript + Vite, PWA con Cloudflare Vite plugin | Evoluciona el prototipo, sirve móvil/tablet y permite recursos locales. |
| API | Cloudflare Worker TypeScript con Hono, organizado por módulos de dominio | Encaja con el runtime elegido y mantiene lógica de permisos, cálculos y sincronización fuera de componentes. |
| Datos | Cloudflare D1 (SQLite), migraciones SQL aplicadas por Wrangler; evaluar Drizzle al crecer el esquema | Relaciones de recetas, equipo, stock y pedidos; una sola historia de migraciones revisable. Evaluar límites de D1 en cada hito de escala. |
| Identidad | Better Auth sobre D1; sesión y permisos de cocina validados en API | Reemplaza el cliente de auth artesanal. Probar integración y recuperación de sesión antes de migrar usuarios. |
| Archivos | R2 privado para fotos, capturas y documentos | Conserva fuente original y permite reprocesar una captura. |
| Trabajos | Cloudflare Queues para extracción de imágenes y tareas asíncronas | La captura no bloquea la interfaz; los consumidores requieren idempotencia. |
| IA | Workers AI: OCR/visión separado de interpretación culinaria con modelo de texto | Modelos intercambiables; la IA crea borradores trazables, no publica recetas sola. |
| Datos locales | Cache Storage para la app e IndexedDB para recetas consultables y operaciones pendientes | Internet intermitente; el servidor conserva autoridad al sincronizar. |

Cloudflare permite desplegar SPA React/Vite y API Worker en la misma plataforma. D1 tiene límites de tamaño y ejecución, por lo que “escalable” significa módulos y datos portables, métricas de uso y un camino de cambio de almacenamiento si el crecimiento lo exige; no asumir capacidad ilimitada de una sola base.

Referencias: [React + Vite en Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [Hono en Cloudflare](https://developers.cloudflare.com/pages/framework-guides/deploy-a-hono-site/), [D1 y límites](https://developers.cloudflare.com/d1/platform/limits/), [migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/), [R2](https://developers.cloudflare.com/r2/get-started/workers-api/), [Queues](https://developers.cloudflare.com/queues/reference/how-queues-works/), [Better Auth y D1](https://better-auth.com/blog/1-5), [offline PWA](https://web.dev/learn/pwa/offline-data).

## Fronteras de dominio

`users`, `kitchens`, `memberships`, `recipe_access` (identidad/permisos); `recipes`, `recipe_versions`, `recipe_ingredients`, `ingredients`, `units` (conocimiento culinario); `stock_lots`, `stock_movements` (existencias); `production_plans`, `batches`, `tasks`, `production_events` (ejecución); `suppliers`, `purchase_orders`, `purchase_lines`, `receipts` (compras); `events` (contexto opcional). Futuro: `shifts`, `change_requests`, `absences`, `certifications`.

Cada operación de API resuelve usuario y cocina, comprueba permiso sobre el recurso y registra cambios relevantes. Las cantidades y precios usan representación decimal exacta o enteros en unidad mínima con reglas explícitas; se evita aritmética monetaria con `float`. Cada receta versionada mantiene su rendimiento base, y cada producción guarda cantidades calculadas y reales para que una edición posterior de receta no altere trabajos en marcha.

## Offline y sincronización

El primer alcance offline es consultar recetas ya sincronizadas y registrar progreso de producción, tareas y movimientos necesarios mientras no hay red. Las escrituras locales llevan `operation_id` estable, actor, cocina, recurso, versión base y fecha; la API confirma cada operación de modo idempotente. Los cambios de stock se modelan como movimientos, no como sobrescritura de saldo. Si una receta o cantidad fue cambiada por otra persona, la app muestra una conciliación; no aplica un último escritor silencioso. Edición colaborativa de recetas sin conexión y envío de pedidos offline quedan fuera del primer alcance.

La app muestra de forma persistente estado de red, cambios pendientes, última sincronización y errores. El cierre de sesión no borra datos pendientes sin advertencia. La autorización offline solo permite consultar datos que el dispositivo ya obtuvo; la API revalida permisos al sincronizar.

El piloto es prioritariamente iPhone, con soporte también para Android. La conservación local y el reintento al abrir/retomar la app no dependerán de ejecución de fondo. Validar Safari y modo de pantalla de inicio, cámara/fototeca, permisos, almacenamiento local y recuperación tras suspensión en el iPhone real del tester. El diseño contempla safe areas y teclado; ver [revisión visual 02](DISENO_REVISION_02.md).

## Ingreso de recetas por imagen

Flujo: capturar/subir → guardar original en R2 → crear trabajo en Queue → transcribir con visión/OCR → interpretar el texto con un modelo culinario → normalizar cantidades/unidades/ingredientes y vincularlos a pasos → generar borrador con fragmento fuente, campos explícitos, inferencias y preguntas → revisión humana → versión de receta. Admitir múltiples imágenes por receta y reintento.

La interpretación textual es el uso previsto para un posible Qwen con unos 3B parámetros activos: resolver “qué va dónde” cuando una receta está desordenada, no leer la imagen. Ante “cebolla y sal”, el modelo puede proponer interpretaciones según el contexto, pero no afirmar como hecho que la sal se usa para sudar la cebolla. Debe marcar la relación ingrediente-paso como incierta y formular una pregunta concreta al chef. Se conserva el texto original y la procedencia de cada propuesta. La revisión cubre orden, tiempos, temperaturas, cantidades, alérgenos y técnicas que cambien el resultado.

En el piloto se evalúan ejemplos reales de mensajes de WhatsApp, notas y cuadernos, con casos ambiguos preparados por el chef. Se miden correcciones, dudas detectadas, errores culinarios críticos y tiempo ahorrado; el modelo se elige por esa prueba, no por nombre.

Cloudflare lista `qwen3-30b-a3b-fp8`, que **activa cerca de 3B parámetros y genera texto**; es un candidato para interpretación posterior al OCR, sujeto a evaluación culinaria. Para leer la imagen se evalúa por separado un modelo con visión o `toMarkdown` de Cloudflare. No se afirma que exista un Qwen3 denso de 3B disponible en Workers AI. Ver [catálogo Workers AI](https://developers.cloudflare.com/workers-ai/models/), [Qwen3 A3B](https://developers.cloudflare.com/changelog/post/2026-04-09-new-workers-ai-models/), [conversión de imágenes](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/) y [modelo con visión](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/).

## Catálogos de proveedores: preparación, no implementación inmediata

El modelo de compras permite añadir `supplier_catalog_items`, empaques/unidades, precios con vigencia, disponibilidad, plazo, zona, fuente y fecha de actualización; vincular cada artículo con un ingrediente normalizado y guardar historial. Un futuro importador acepta catálogo cedido por proveedor o indexación autorizada de web. Las comparaciones consideran costo por unidad útil, mínimo de pedido, transporte y entrega posible, y muestran fuente/fecha para evitar recomendaciones basadas en precios viejos.

## Seguridad, operación y migración

Separar desarrollo, prueba y producción; guardar secretos en Cloudflare, nunca en el cliente; respaldar D1 y originales R2; observar errores de sincronización, extracción, pedidos y costos de IA. Validar roles y acceso entre cocinas aun cuando el piloto tenga una sola. Migrar usuarios/datos del prototipo solo tras inventariar el proyecto Supabase real y ensayar la importación. No activar dependencias de Supabase en el destino.

Antes de pasar cualquier cambio a Git: revisar documentación relacionada, ejecutar pruebas de reglas y flujos afectados, build y prueba de uso pertinente; cerrar servidores temporales al terminar. Abrir PR solo tras revisión; no fusionar sin autorización del dueño.
