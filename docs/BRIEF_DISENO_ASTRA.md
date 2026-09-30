# Prompt de contexto para Astra — diseño de Brigade

> **Diseño ya aprobado.** El usuario aprobó ambas presentaciones de la revisión 02: móvil para teléfonos y escritorio para escritorio. La referencia definitiva está en `docs/diseno/aprobado/`. Los campos y funciones todavía deben completarse e integrarse a partir de B-B-Chef y Brigade. Este brief se conserva como contexto histórico; no es una instrucción para reiniciar la elección visual.

> Actualización posterior al primer diseño: el usuario valoró las fuentes, pidió navegación fija centrada abajo basada en Spotlight Navbar, botones con brillo monocromático permanente sin movimiento inspirados en Glow Border Card y recetas basadas en Highlight Grid. La composición debe diseñarse desde el celular. Debe funcionar en iPhone y Android; el tester usará iPhone a tiempo completo. Consultar `docs/DISENO_REVISION_02.md` como propuesta vigente; reemplaza la navegación lateral/superior y la adaptación móvil del primer diseño.

Quiero que dirijas el **rediseño completo de Brigade**. Este brief reúne las decisiones de producto necesarias para comenzar. Si tenés acceso al workspace local, leé también `Brigade/README.md`, `Brigade/docs/PRODUCTO.md` y `Brigade/docs/ARQUITECTURA.md`; estos documentos todavía no están publicados en https://github.com/Joabertini/Brigade. El código actual es un prototipo y no define la jerarquía ni el aspecto final. Entregá una propuesta visual y de interacción para aprobación antes de modificar código de aplicación.

## Producto y usuarios

Brigade es un sistema operativo para una cocina profesional. Lo usan un chef, su sous chef y empleados de cocina durante trabajo real, con móvil, tablet y escritorio. El primer piloto es un chef y su equipo en un balneario con internet intermitente. La pantalla principal debe partir de **la cocina de hoy: producciones, tareas, faltantes y pedidos**, no de eventos. Eventos existe desde el día 0 como función independiente que puede relacionarse con una producción. En una etapa posterior habrá horarios, cambios de turno, ausencias y certificaciones; dejá crecer la navegación sin fingir que esas funciones ya están listas.

Las tareas centrales del piloto son: crear y compartir recetas; ingresar recetas desde capturas de WhatsApp, notas del celular y fotos de cuadernos; revisar la extracción antes de guardar; escalar ingredientes por porciones/rendimiento y merma; planificar y registrar producciones; consultar/ajustar stock; armar y seguir pedidos de compra a proveedores; asignar y completar tareas; registrar eventos opcionales. Debe ser evidente qué puede hacer cada rol sin presentar una app distinta e inconexa para cada uno.

## Dirección visual

Diseñá una identidad nueva para **Brigade**. El nombre y la funcionalidad de cocina son los únicos puntos de partida obligatorios. Quiero un tema oscuro, contemporáneo, de alta legibilidad, con acentos de color que destaquen información y acciones. Tomá como estándar de oficio visual la calidad de referencias como “Vengence UI” o “UI UX Pro Max”; buscá un resultado propio, sin copiar plantillas ni convertir la interfaz en un dashboard SaaS genérico.

**Única preferencia visual que quiero conservar de B-B-Chef:** la fuente de los títulos de platos, `Cormorant Garamond` en itálica (`.plato-row-nombre` en `bertini-app.html`). Podés ajustar tamaño, peso, interlineado y dónde se aplica para integrarla bien. Rediseñá todo lo demás: paleta, layout, navegación, tarjetas, formularios, iconos, botones, jerarquía y estilo de marca. No tomes el diseño general de B-B-Chef ni el prototipo actual de Brigade como restricción.

Priorizá lectura rápida bajo iluminación de cocina, manos ocupadas y uso táctil: texto principal y números grandes, cantidades y unidades imposibles de confundir, contraste fuerte, blancos de interacción generosos, estados reconocibles también sin depender solo del color y acciones críticas con confirmación clara. Evitá etiquetas diminutas, grises de bajo contraste y pantallas saturadas. Diferenciá visualmente **previsto / disponible / faltante / producido / pendiente de sincronización**.

## Flujos que el diseño debe resolver

1. **Inicio de jornada:** el chef ve producciones de hoy, progreso del equipo, tareas urgentes, faltantes y pedidos por enviar. El empleado ve tareas autorizadas, recetas necesarias y su progreso.
2. **Captura de receta:** cámara/archivo o varias imágenes → OCR/visión → interpretación culinaria del texto con un modelo tipo Qwen → original junto al borrador editable → incertidumbres resaltadas por campo → confirmar y guardar, con alternativa de ingreso manual. La interfaz debe distinguir lo transcrito literalmente de una relación inferida entre ingrediente y paso. Mostrar un ejemplo realista de WhatsApp y otro de cuaderno manuscrito. Usar el caso ambiguo “cebolla y sal”: no mostrar “sudar la cebolla con sal” como instrucción confirmada; pedir al chef que indique cuándo se incorpora la sal si el contexto no lo aclara. La revisión de IA es una función principal, no un modal accesorio.
3. **Receta a producción:** receta y versión → objetivo de porciones o rendimiento → cantidades escaladas y merma → existencias y faltantes → tandas y tareas → registro de lo realmente hecho.
4. **Compra:** lista consolidada agrupable por proveedor → edición del pedido → revisión → envío explícito cuando haya red → seguimiento de confirmación y recepción. Preparar espacio conceptual para precios/catálogos de proveedor futuros sin inventar comparaciones aún.
5. **Trabajo intermitente:** indicador discreto pero inequívoco de conexión, última sincronización, acciones pendientes, error y conflicto. El usuario debe saber si su trabajo quedó guardado localmente y cuándo llegó al servidor.
6. **Evento opcional:** crear/ver evento y vincularlo a recetas o producción si corresponde. La navegación y el modelo mental de la app no giran alrededor del evento.

## Entregables para revisar conmigo

- Arquitectura de información y mapa de navegación móvil/tablet/escritorio, con justificación de prioridades.
- Dos direcciones visuales breves; desarrollar la elegida como sistema de diseño (tipografías, escala, colores, contraste, números, espaciado, iconografía, componentes, estados).
- Wireframes de los flujos anteriores y pantallas de alta fidelidad para inicio, biblioteca/detalle de recetas, captura y revisión, plan de producción, stock, pedidos, tareas del empleado y evento.
- Estados vacíos, carga, error, sin conexión, pendiente de sincronización, conflicto y confirmación; interacciones principales y prototipo navegable o equivalente revisable.
- Explicación concisa de cómo el diseño reduce pasos y errores durante una jornada real de cocina.

Usá contenido de ejemplo culinario plausible en español, con cantidades, unidades y nombres legibles. No presentes datos de precios o entregas de proveedores como reales. Primero quiero aprobar el diseño; no implementes el rediseño en código hasta esa revisión.
