# Índice de documentación

| Necesidad | Documento | Código actual de referencia |
| --- | --- | --- |
| Visión, usuario piloto y funciones | [PRODUCTO.md](PRODUCTO.md) | `src/App.tsx`, `src/features/*` |
| Secuencia de trabajo y criterios del piloto | [PRODUCTO.md](PRODUCTO.md) | Alcance; avance en [IMPLEMENTACION.md](IMPLEMENTACION.md) |
| Stack Cloudflare, datos, offline e IA | [ARQUITECTURA.md](ARQUITECTURA.md) | `worker/*`, `migrations/*`, `src/data/*` |
| Dirección de diseño y entrega de Astra | [BRIEF_DISENO_ASTRA.md](BRIEF_DISENO_ASTRA.md) | `src/styles.css`; referencia tipográfica en B-B-Chef |
| Propuesta visual inicial, wireframes y fuentes consultadas | [DISENO.md](DISENO.md) | Histórico; composición sustituida por revisión 02 |
| Diseño aprobado: iPhone primero, Android, navegación inferior fija y Vengeance UI | [DISENO_REVISION_02.md](DISENO_REVISION_02.md) | Aprobadas las presentaciones móvil y escritorio |
| Copia exacta del diseño aprobado y vista navegable | [diseno/aprobado/README.md](diseno/aprobado/README.md) | Fuente, HTML independiente y manifiesto de integridad |
| Implementación, correspondencia de código y estado verificado | [IMPLEMENTACION.md](IMPLEMENTACION.md) | `src/main.tsx`, `src/features/*`, `shared/kitchen.ts`, `worker/index.ts`, `migrations/*` |
| Trabajo de esta sesión | [sesiones/2026-10-01.md](sesiones/2026-10-01.md) | — |
| Sesión anterior | [sesiones/2026-09-30.md](sesiones/2026-09-30.md) | — |

En `d1fd62c` no existían README, documentación del producto, esquema de base de datos, migraciones ni pruebas. La implementación nueva está en curso; [IMPLEMENTACION.md](IMPLEMENTACION.md) distingue lo ejecutable de lo pendiente. Antes de implementar cualquier módulo, consultar el documento correspondiente y actualizarlo al terminar la tarea.
