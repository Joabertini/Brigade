# Diseño aprobado de Brigade

Aprobación explícita del usuario: **30 de septiembre de 2026**. Versión conservada: **revisión 02**.

- **Celular · primero:** referencia para iPhone y Android. iPhone es el dispositivo principal del tester.
- **Escritorio:** referencia para pantallas de escritorio.

Son dos presentaciones del mismo producto y sistema visual. Ambas están aprobadas; no hay una elección pendiente entre ellas. Las propuestas anteriores Pase/Cuaderno quedan como antecedentes.

## Archivos conservados

- [Diseño navegable](brigade-v2.html): documento que se puede abrir en un navegador, con selector de vista móvil/escritorio. Usa datos ficticios e interacciones de demostración. Las fuentes externas necesitan conexión para cargarse.
- [Fuente exacta del mock aprobado](brigade-v2.fragment.html): copia sin cambios del diseño presentado en la conversación.
- [Manifiesto de integridad](manifest.json): hashes SHA-256 para identificar esta referencia.
- [Especificación visual aprobada](../../DISENO_REVISION_02.md): decisiones de navegación, tipografías, componentes, adaptación móvil y comprobaciones realizadas.

## Alcance de la aprobación

Quedan aprobados el diseño, sus dos composiciones, tipografías, menú inferior anclado, brillo monocromático permanente sin movimiento y tarjetas de recetas.

El usuario señaló que todavía faltan los campos completos y la integración entre las funciones existentes en los repositorios. Por tanto, el contenido reducido del mock no autoriza a descartar campos, cálculos, estados o flujos. Para la implementación, completar un inventario de B-B-Chef y Brigade y vincular cada campo y función con el módulo de destino, según el alcance de producto acordado. Cuando un requisito no tenga representación en el mock, extender el diseño aprobado de manera coherente.

Siguen pendientes backend Cloudflare, datos y permisos reales, OCR e interpretación culinaria, sincronización, conexiones entre módulos y pruebas en el iPhone del tester. La aprobación visual no constituye validación de esas capacidades.

Esta carpeta conserva la referencia aprobada. Los futuros cambios de implementación deben compararse con ella. Si se acuerda una nueva revisión visual, conservar esta versión como antecedente y registrar la nueva decisión.
