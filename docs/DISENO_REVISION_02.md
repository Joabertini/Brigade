# Brigade — revisión de diseño 02

Estado: **diseño aprobado por el usuario el 30 de septiembre de 2026**. Se aprueban ambas presentaciones del mismo diseño: el primer mock para móvil (iPhone y Android) y el segundo para escritorio. Esta revisión reemplaza la navegación lateral/superior y la adaptación móvil de la propuesta 01. Conserva Cormorant Garamond itálica para platos y DM Sans para controles, cantidades y lectura operativa.

La aprobación es visual. Quedan pendientes los campos completos, las reglas de negocio y la integración de las funciones existentes en B-B-Chef y Brigade. Las omisiones de los mocks no eliminan requisitos del producto. La referencia conservada y su alcance se encuentran en [Diseño aprobado](diseno/aprobado/README.md).

## Dispositivos y prioridad

Brigade debe funcionar en **iPhone y Android**. El tester trabajará a tiempo completo desde un **iPhone**: es el dispositivo principal de diseño y aceptación del piloto. El planteo técnico sigue siendo una PWA; el dato de plataforma no implica por sí solo distribuir aplicaciones nativas en las tiendas.

La composición parte de un teléfono: una tarea dominante, cantidades legibles, decisiones cercanas al pulgar y detalle bajo demanda. Escritorio aprovecha el ancho para disponer secciones relacionadas en paralelo. La vista móvil no se obtiene reduciendo todas las columnas de escritorio.

## Navegación inferior anclada

La navegación es una cápsula centrada en el borde inferior y conserva su posición mientras se desplaza el contenido. Se elimina la barra lateral. En teléfono se ven **Hoy, Recetas, Cocina, Pedidos y Más**. Cocina abre producción; Más abre Stock, Equipo, Eventos, Capturar, Conexión y Nueva receta. En escritorio se muestran los siete módulos directamente en la cápsula. Los permisos ajustan los accesos: el commis tiene sus tareas y no recibe acceso a compras por el hecho de ver un enlace.

Cuatro accesos y Más permiten mantener blancos táctiles amplios en teléfono. No se colocan siete etiquetas estrechas ni una barra que haya que desplazar lateralmente para descubrir módulos. Eventos está accesible desde el día 0 y conserva el mismo nivel de funcionalidad que los demás módulos.

El prototipo representa una pantalla de dispositivo con scroll interno: el menú está anclado al viewport de esa pantalla, no al final del documento. Al bajar hasta el último elemento se mantiene espacio suficiente para dejar el contenido por encima del menú. En la aplicación se implementará con el viewport disponible y los insets del sistema; esta simulación no representa el teclado real de iOS.

## Adaptación de los componentes indicados

| Referencia solicitada | Qué se conserva | Adaptación para Brigade |
| --- | --- | --- |
| [Spotlight Navbar](https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/spotlight-navbar.json) | Cápsula, ambiente luminoso bajo el destino activo y respuesta visual al interactuar | Anclaje inferior centrado; icono y etiqueta; destinos táctiles; acceso Más en móvil; estado activo útil sin mouse |
| [Glow Border Card](https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/glow-border-card.json) | Borde luminoso y halo suave | Botones semánticos de un solo color verde claro, brillo permanente, sin rotación, animación, pulso ni movimiento; el halo no depende de hover |
| [Highlight Grid](https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/highlight-grid.json) | Grilla continua con celda destacada y brillo interior | Recetas de ancho completo en teléfono; dos columnas en escritorio; título serif, rendimiento y privacidad legibles; un toque abre la receta; foco de teclado visible |

El código publicado de Highlight Grid utiliza una anchura mínima de 760 px y eventos de mouse para mover el destacado. Esa geometría no se traslada al móvil. Glow Border Card es un contenedor visual; el elemento que recibe la acción en Brigade sigue siendo un botón accesible. Spotlight Navbar requiere adaptación de posición: la referencia no establece por sí sola la navegación fija inferior del producto.

En esta etapa se adaptan las referencias en una propuesta independiente. Los comandos `npx shadcn` indicados no se ejecutaron sobre la aplicación: su integración React corresponde a la implementación posterior a la aprobación visual. No se afirma que el prototipo instancie los componentes React originales.

## Qué cambia en cada flujo

| Flujo | Diseño de esta revisión |
| --- | --- |
| Hoy | Próximo pase, preparación en curso y una acción principal. Los faltantes y la preparación siguiente tienen accesos breves, sin repetir un tablero de métricas |
| Recetas | Una columna de tarjetas anchas en móvil; fuente de platos protagonista, privacidad y rendimiento visibles; búsqueda y filtros; dos columnas en escritorio |
| Detalle de receta | Ingredientes y pasos en vistas separadas; cantidades conservan tamaño y unidad; acción para producir al terminar la lectura |
| Captura | Revisión por pasos: una duda culinaria por vez, fragmento fuente junto a la pregunta, respuestas táctiles amplias, acceso al original y resumen antes de guardar |
| Producción | Cantidades, Tareas y Registro son vistas separadas. Las cantidades se presentan por ingrediente con neto/bruto/disponible, sin tablas horizontales comprimidas |
| Pedidos | Un bloque por proveedor, cantidad requerida visible y revisión previa al envío. El envío queda bloqueado sin red |
| Stock | Ingrediente, ubicación y disponible en filas amplias; entrada de stock con cantidad explícita |
| Equipo | Tareas con controles táctiles y responsables. No se introducen horarios aún |
| Eventos | Ocasión, fecha, comensales y acceso a producción vinculada; módulo disponible desde Más en teléfono |

La captura conserva el caso «cebolla y sal». El primer paso pregunta cuándo se agrega la sal, sin dar por confirmada una técnica. El segundo pregunta si el peso de la cebolla es bruto o neto. Al terminar, el chef revisa sus respuestas y confirma; el rendimiento ausente permanece pendiente de medir.

## Diseño para iPhone y Android

- Reservar espacio para el indicador inferior y recortes del dispositivo mediante `env(safe-area-inset-*)`; el margen de navegación no puede depender de un número fijo idéntico para todos los teléfonos.
- Usar alturas basadas en el viewport realmente disponible. Validar cambios de barra de Safari, orientación y teclado; un formulario enfocado debe poder desplazarse hasta dejar el campo y su acción visibles.
- Botones de acción de 52 px de alto y destinos de navegación de 58 px; respuestas de captura de al menos 54 px. Inputs de 16 px o más.
- No depender de hover: tocar abre recetas y destinos. El destacado visual también responde al foco y la selección.
- Probar en Safari y como app añadida a la pantalla de inicio de iPhone. Probar Chrome y modo instalado en Android.
- Mantener un estado visible de guardado local, pendientes y última sincronización. Retomar la app debe disparar una comprobación de conectividad y sincronización; la arquitectura no depende de una tarea de fondo para conservar o enviar registros.
- Validar cámara, fototeca, selección múltiple y permisos en ambos sistemas. Una captura pendiente de análisis debe conservar la imagen aunque todavía no haya red.

Estas son condiciones de aceptación de la implementación. Un viewport táctil emulado no sustituye la prueba en el iPhone del tester.

## Fuentes de plataforma

| Fuente primaria | Aplicación |
| --- | --- |
| [WebKit: áreas seguras de iPhone](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) | Insets, `viewport-fit` y margen de elementos fijados |
| [Apple: diseño para Safari](https://developer.apple.com/videos/play/wwdc2021/10029/) | Área visible y barras de navegación del navegador |
| [WebKit: apps de pantalla de inicio](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) | Contexto de ejecución como web app instalada |

## Alcance y revisión

La propuesta usa datos de ejemplo. La navegación, respuestas de captura, escalado, registro de tandas y estados son interacciones locales para revisar diseño. No hay OCR, IA, servidor, envío ni sincronización real.

La revisión se realiza en Chromium con emulación táctil y varios anchos, junto con inspección visual de las pantallas. WebKit no está disponible en el entorno de revisión; la prueba real de Safari/iPhone queda pendiente para la implementación. No se presenta esta comprobación como validación en un dispositivo iOS.

Resultado: 11 pantallas revisadas a 320, 360, 375, 390 y 414 px. En las 55 combinaciones no se detectaron controles o títulos fuera del ancho, el menú mantuvo su posición al desplazar el contenido y los destinos de navegación conservaron al menos 44 px. Se recorrieron la captura por pasos, confirmación del chef, cálculo a 60 porciones, registro de tanda y pedido bloqueado sin red. Al simular reconexión, el pedido siguió en borrador. La ejecución revisada no registró errores JavaScript.
