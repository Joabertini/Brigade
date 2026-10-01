# Importación de recetas de B-B-Chef

Fuente: `CARTA_INICIAL` de `B-B-Chef/bertini-app.html`, commit `fe958ceed4c9bfa457cf3a17b9d7e76b0ec951a1`. Destino: cuenta chef de la cocina de prueba **El Mirador** en la D1 remota de Brigade. Fecha: 2026-10-01.

## Estado

La carta fuente contiene 12 platos, 66 ingredientes y 78 tareas. Se importaron **10 recetas privadas**, con los 66 ingredientes y 74 tareas correspondientes. Las otras dos tienen pasos, pero carecen de ingredientes y rendimiento numérico en el origen; no se inventaron cantidades para hacerlas pasar por recetas escalables.

| Curso | Recetas importadas | Rendimiento base en Brigade |
| --- | --- | --- |
| Entradas | Croquetas de Jamón Crudo; Langostinos al Fuego; Empanadas de Lomo Desmechado | 16, 6 y 12 porciones |
| Principales | Boeuf Bourguignon; Gnocchi di Spinaci; Lasagna Bolognese; Panzotti de Cordero | 6, 6, 8 y 6 porciones |
| Postres | Tiramisú; Peras al Vino Tinto; Crème Brûlée | 8, 5 y 5 porciones |

Pendientes: **Sándwich de Focaccia** y **Brownie con Helado**. Ambos dicen «Según porciones» y tienen cero ingredientes. Para mostrarlos en el recetario sin atribuirles cantidades ficticias hace falta completar sus datos o admitir borradores incompletos en Brigade.

## Correspondencia de datos

- Se conservaron nombre, curso, descripción, cantidad y unidad de cada ingrediente, orden de tareas, etapa D-2/D-1/servicio, notas técnicas y rendimiento original descriptivo.
- El rendimiento numérico utiliza las porciones indicadas o deducibles directamente del texto original. La descripción conserva su forma original, incluida la aproximación `≈` cuando corresponde.
- Las tareas de B-B-Chef se copiaron como pasos de la receta. Las notas de ingredientes se conservaron en la descripción. No se inventaron vínculos entre un paso y un ingrediente.
- «2 sobres» de gelatina pasó a `2 un` de «Gelatina sin sabor (sobre)» porque Brigade aún no tiene la unidad `sobre`.
- El origen no especifica merma; quedó en cero técnico y cada descripción advierte que la receta requiere revisión culinaria antes de producir. No se migraron precios, unidades de compra ni cálculos de costo de B-B-Chef. La cocina de prueba no tiene catálogo de stock, así que los ingredientes quedaron sin vínculo de inventario.
- El esquema actual exige `confirmed_by_user_id`; se usó el identificador del chef dueño para cumplir esa restricción técnica. Esto **no acredita una revisión humana** de las recetas importadas. La descripción de cada una las marca para revisión.
- Las recetas se dejaron privadas para el chef. No se compartieron con el equipo ni se crearon producciones.

## Comprobaciones

Antes de escribir se exportó la D1 remota a un respaldo privado fuera del repositorio. El SQL de importación se probó sobre esa copia: añadió 10 recetas, 66 ingredientes y 74 pasos, respetó claves foráneas y una segunda ejecución no duplicó registros. En D1 remota se verificaron esos mismos conteos, los diez títulos y cursos, y `PRAGMA foreign_key_check` sin errores. La cuenta tenía seis recetas antes y dieciséis después.

Estas comprobaciones validan la copia de datos. No sustituyen la revisión culinaria del chef ni una prueba de uso de cada receta en el iPhone.
