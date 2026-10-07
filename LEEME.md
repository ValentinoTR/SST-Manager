# SST Control — actualización de interfaz y experiencia

## Abrir y publicar

Abre index.html con Chrome o Edge para una revisión rápida. Para uso habitual, sirve la carpeta desde un servidor web o publica sus archivos en tu mismo proyecto de GitHub Pages. No necesita instalar paquetes ni un proceso de compilación.

Al actualizar, sube index.html, styles.css, app.js, metrics.js, reports.js, workspace.css y workspace.js juntos. Mantén la misma dirección web y navegador para acceder a tus datos anteriores. Los datos de una dirección web no aparecen automáticamente al abrir otra copia local.

Esta entrega no ha sido publicada en GitHub Pages.

## Cambios

- Sistema visual verde, tarjetas más claras, iconos vectoriales y navegación agrupada.
- Resumen principal y métricas al inicio del tablero; filtros mensuales compactos.
- Menú plegable en celulares y tablas con desplazamiento dentro de su contenedor.
- Buscador de módulos y colaboradores por nombre, DNI o área. Admite búsquedas sin tildes y el atajo Ctrl/Cmd + K.
- Navegación con teclado: Escape, recorrido de foco en modales, flechas en resultados y enlace para saltar al contenido.
- Respaldo JSON completo con archivos adjuntos. Restauración con validación de formato, confirmación y descarga previa de una copia de seguridad.
- Fecha actual según la zona horaria del dispositivo, en lugar de UTC.
- Aviso explícito si el navegador no permite guardar los cambios.
- Identificación de los colaboradores de ejemplo en el primer inicio.

## Respaldos

En Respaldos, selecciona Descargar respaldo completo. El archivo contiene registros personales y evidencias: consérvalo en un lugar privado. Para restaurarlo, selecciona Restaurar respaldo y elige un JSON generado por esta versión. La restauración reemplaza los registros actuales y conserva los archivos ya almacenados además de los restaurados. Se admite un respaldo de hasta 250 MB; el espacio disponible depende del navegador.

No borres los datos del navegador antes de descargar tu respaldo. La restauración no sincroniza equipos ni convierte el sistema en una aplicación multiusuario.

## Verificación

- 80 pruebas existentes de métricas y reportes aprobadas (node --test metrics.test.js reports.test.js).
- Revisión en Chrome: navegación de 13 módulos, ficha de colaborador, búsqueda sin tildes y apertura de formulario.
- Capturas revisadas en 1440 × 1000 y 390 × 844; sin desbordamiento horizontal del tablero móvil.
- Menú móvil: apertura y cierre al navegar.
- Respaldo y restauración de 7 colaboradores de prueba y un archivo de texto: contenido recuperado.
- Rechazo de respaldo con formato inválido sin reemplazar registros.
- Sin excepciones JavaScript en los recorridos de navegador probados.

## Alcance

Se mantienen los módulos y el almacenamiento local del proyecto original. Esta actualización no agrega servidor, cuentas, roles, sincronización, auditoría multiusuario ni certificación de cumplimiento normativo. Para producción compartida, esas funciones requieren una siguiente fase de desarrollo. Las pruebas cubren los flujos indicados; no son una garantía de ausencia total de errores.
