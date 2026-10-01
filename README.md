# Brigade

Brigade es una herramienta para operar una cocina profesional con un equipo: recetas, ingredientes, producción, stock, compras a proveedores, tareas y eventos. La producción diaria es el centro; un evento es una función disponible desde el primer lanzamiento y puede vincularse a una producción, sin ser requisito para crearla.

## Estado actual

La base de la reestructuración funciona con Vite, React/TypeScript, Worker Hono, Better Auth y D1. Ya permite cuentas e invitaciones, recetas privadas o compartidas, captura de recetas por texto o foto con revisión, cálculo de cantidades y merma, planes y registros de producción, eventos opcionales, inventario y pedidos a proveedores con recepción parcial. La PWA conserva lecturas y tandas pendientes durante cortes de red. Tareas y varios flujos de piloto siguen en desarrollo; ver [estado verificado](docs/IMPLEMENTACION.md). El prototipo anterior de Supabase está preservado en `legacy/brigade-cra/` como referencia inerte.

```sh
npm install
npm run db:migrate:local
npm run dev
```

Copiar `.dev.vars.example` a `.dev.vars` y definir secretos propios para ejecutar identidad local. `npm test` verifica los cálculos y `npm run build` comprueba cliente, Worker y PWA. La D1 local se usa en desarrollo; la D1 remota configurada ya existe. La primera cuenta de chef se crea una sola vez mediante `POST /api/setup/first-chef` con el encabezado `X-Brigade-Setup`; el alta pública está cerrada y la configuración inicial remota ya se completó. El resto entra por invitación. Detener el servidor al terminar de usarlo.

## Documentación

- [Índice](docs/INDICE.md)
- [Producto y alcance](docs/PRODUCTO.md)
- [Arquitectura propuesta](docs/ARQUITECTURA.md)
- [Brief de diseño para Astra](docs/BRIEF_DISENO_ASTRA.md)
- [Propuesta de diseño y wireframes](docs/DISENO.md)
- [Revisión visual vigente: iPhone, Android y navegación inferior](docs/DISENO_REVISION_02.md)
- [Diseño aprobado: referencia navegable y fuente](docs/diseno/aprobado/README.md)
- [Hoja de ruta de la sesión](docs/sesiones/2026-10-01.md)
- [Estado de implementación y correspondencia con B-B-Chef](docs/IMPLEMENTACION.md)

La documentación de producto describe el destino; el estado de implementación anterior identifica lo que ya funciona y los límites del prototipo local.

La propuesta visual 01 (Pase/Cuaderno) se conserva como antecedente. La referencia aprobada es la revisión 02, con sus presentaciones móvil y escritorio.

La revisión 02 está **aprobada**: presentación móvil para iPhone/Android y presentación de escritorio para escritorio. Conserva navegación inferior anclada, brillo estático en botones y recetas con tarjetas amplias. Se guarda como referencia para implementar los campos, reglas y flujos completos de los repositorios; el mock no define por omisión el alcance funcional.
