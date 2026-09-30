# Brigade: producto y alcance

## Decisión de producto

Brigade ayuda a un chef a llevar el control cotidiano de una cocina profesional junto a su equipo. La prioridad es reducir el trabajo de transcribir recetas dispersas, calcular cantidades, planificar producciones, saber qué falta y hacer pedidos a proveedores. La guía de producto la aporta el dueño del proyecto, sous chef con diez años de experiencia; no se condiciona el inicio a una etapa de observación externa.

El piloto comienza con un chef y su equipo en un balneario con internet intermitente. Debe ser posible consultar recetas y registrar avance de producción con y sin conexión. Un evento está disponible desde el día 0, pero las recetas, tareas, compras y producciones no dependen de un evento.

La herramienta debe funcionar en iPhone y Android. El tester usará iPhone a tiempo completo, por lo que diseño, uso táctil y aceptación del piloto priorizan ese dispositivo. Se mantiene la propuesta PWA, con validación en Safari y como app de pantalla de inicio, además de Android.

## Funciones del primer lanzamiento

1. **Recetas propias y compartidas.** Cada usuario puede crear recetas privadas y compartirlas con personas de su equipo. Cada receta registra ingredientes, cantidades, unidades, procedimiento, rendimiento, porciones, mermas relevantes y versiones. Una producción guarda la versión utilizada.
2. **Ingreso por imagen.** Capturar o subir una o varias capturas de WhatsApp, notas del celular o fotos de cuadernos. Primero transcribir con OCR/visión; después usar un modelo de texto culinario para relacionar ingredientes, cantidades y pasos, interpretar abreviaturas y detectar omisiones. El modelo nunca debe inventar una técnica o una secuencia como hecho. Por ejemplo, “cebolla y sal” no determina por sí solo si la sal se agrega para sudar la cebolla o al final. El borrador distingue texto explícito de inferencias y preguntas, muestra la fuente original junto a cada campo dudoso y exige confirmación humana antes de guardar. La edición manual siempre está disponible.
3. **Ingredientes y stock.** Catálogo normalizado, unidades/conversiones, cantidades disponibles, ubicaciones y movimientos trazables de entrada, consumo y ajuste. Lotes y vencimientos se incorporan donde sean útiles para el piloto.
4. **Producción.** Planificar una preparación indicando porciones o rendimiento objetivo, escalar receta y mermas, obtener cantidades requeridas, registrar tandas y avance real, asignar tareas y ver faltantes. La pantalla principal muestra el trabajo de cocina del día.
5. **Compras a proveedores.** Consolidar requerimientos de producción, descontar stock utilizable, agrupar por proveedor y preparar un pedido. Estados iniciales: borrador, enviado, confirmado, recibido y cancelado. El envío es explícito y se hace con conexión para evitar duplicados; se define el canal concreto antes de implementarlo.
6. **Eventos.** Alta, consulta y edición de eventos con fecha, nombre, comensales y notas; vínculo opcional con recetas, producciones y tareas. La operación diaria funciona igualmente sin evento.
7. **Equipo y roles.** `chef` administra cocina, integrantes, recetas compartidas y compras; `sous_chef` organiza producción y prepara pedidos; `commis` consulta lo compartido y registra tareas/producción autorizadas. La matriz exacta de permisos por operación se confirma antes de codificarla. Propiedad de receta y rol de equipo son conceptos separados.

## Ampliación posterior

Construir horarios del equipo, consultas de cambios, ausencias y certificaciones sobre el mismo modelo de usuarios y permisos. Las vistas actuales de turnos no equivalen a esa función terminada.

Los catálogos de proveedores son una ampliación prevista. Brigade podrá importar catálogos suministrados por el proveedor o indexar fuentes web con permiso. El modelo debe admitir productos, presentación, unidad comparable, precio con fecha, disponibilidad, plazo de entrega y fuente. Las sugerencias de “precio más competitivo” o “puede llegar mañana” deben citar datos actuales y tener en cuenta unidad, cantidad, zona y costo de entrega; no se deben inferir como certezas si faltan datos.

## Secuencia de ejecución aprobada como dirección

1. **Diseño primero — aprobado.** La revisión 02 queda aprobada con su presentación móvil para teléfonos y su presentación de escritorio. Ver [referencia conservada](diseno/aprobado/README.md). Se mantienen Cormorant Garamond itálica para platos, navegación inferior anclada y tratamientos visuales acordados. Faltan incorporar los campos y conectar las funciones de B-B-Chef y Brigade: la aprobación del diseño no declara completo el producto.
2. **Base técnica.** Auditar datos reales del prototipo Brigade, migrar React de Create React App a Vite/TypeScript, separar cliente y API Worker por módulos, crear D1/migraciones/R2, autenticación, permisos, pruebas, entornos y documentación.
3. **Primer flujo completo.** Ingreso manual y por imagen de receta → revisión → compartir → escalar a porciones → plan de producción → tareas y registro real, con funcionamiento sin conexión para consulta y registro.
4. **Stock y compras.** Movimientos, faltantes, pedido por proveedor y recepción. El modelo queda preparado para catálogos y comparaciones futuras.
5. **Piloto.** Ejecutar producciones reales con el chef y su equipo, probar cortes de conexión, corregir fricciones y cálculos observados. El producto no requiere una fase previa de observación para comenzar.
6. **Horarios.** Ampliación posterior descrita arriba. Eventos permanecen desde el primer lanzamiento como módulo transversal.

## Aceptación del piloto

El chef puede ingresar una receta desde una imagen, resolver dudas culinarias señaladas, corregirla, compartirla, planificar cantidades y producir sin planilla paralela. La evaluación de captura incluye recetas desprolijas y comprueba que ninguna ambigüedad técnica crítica se convierta silenciosamente en una instrucción. Las cantidades y conversiones tienen pruebas con unidades, rendimiento y merma; stock y pedido no cuentan dos veces lo mismo. Un integrante ve solo lo autorizado. Tras una caída de red, lo registrado en producción se sincroniza una sola vez, con conflictos visibles. Un pedido no se envía automáticamente al reconectar.

No se trasladará B-B-Chef completo: sus recetas y cálculos son material para revisar y, si conviene, migrar por partes. Su enfoque en eventos y su interfaz general no son la base de Brigade.
