# Auditoría de indicadores y reportes

Revisión local del 1 de noviembre de 2026. Ámbito: `metrics.js`, `reports.js` y sus pruebas. No se consultaron datos personales de producción, no se modificó Supabase y no se enviaron correos. Los ejemplos de verificación son sintéticos.

## Arquitectura y contratos conservados

Los dos módulos siguen siendo funciones puras con exportaciones CommonJS para Node y `window.SSTMetrics` / `window.SSTReports` para el navegador. No se añadieron dependencias. El PDF general sigue siendo HTML imprimible por el navegador; el Excel sigue siendo un archivo OOXML real, generado sin librerías externas. Los PDF de vehículos y charlas tienen un generador servidor independiente.

Se conservan los cuatro alcances de reporte, las claves de secciones y métricas, el historial de filas, las exportaciones públicas y las colecciones originales. No se borran ni corrigen registros automáticamente.

## Hallazgos y cambios

| Prioridad | Hallazgo comprobado | Tratamiento local |
| --- | --- | --- |
| Alta | Una cadena de fecha inválida producía `NaN`; las comparaciones acababan en «Vigente». Fechas como 31 de abril se normalizaban al mes siguiente. | Validación de fecha civil antes del cálculo; se devuelve «Fecha inválida», sin deducir vigencia. Se conserva el umbral de 30 días. |
| Alta | El resumen «Seguros vigentes» contaba cualquier póliza que no fuera «expired», incluyendo fechas vacías. | Solo suma estados `ok` y `due`. Las filas desconocidas siguen visibles y exportables. |
| Alta | La ficha individual convertía fechas ausentes de seguros, EMO y licencia en un control cumplido. | Se marca `missing`: no puede comprobarse la vigencia. No se establece una nueva duración legal. EPP sin fecha de renovación conserva su tratamiento anterior de entrega registrada; una fecha de renovación escrita pero inválida se señala para revisión. |
| Media | El contador de últimos incidentes aceptaba fechas inexistentes; las horas manuales admitían meses inexistentes. | Se rechazan fechas/meses civiles inválidos en los cálculos o solicitudes nuevas, conservando los datos de origen. |
| Media | Los KPI del módulo `training` se llamaban «charlas», pudiendo confundirse con el módulo diario independiente. | Se denominan «Capacitaciones» sin mezclar ni migrar las colecciones. |
| Media | Los filtros mensual/anual, trabajador y área eran excluyentes. | Se añaden opciones `dateFrom`, `dateTo`, `filterArea` y `filterWorkerId`, que intersectan el alcance original. Fechas inválidas o invertidas producen un `RangeError` con mensaje legible. |
| Media | El HTML impedía dividir secciones enteras, carecía de tamaño de página explícito y los textos extensos podían desbordar. | A4 horizontal, encabezados de tabla repetibles, filas protegidas cuando caben, ajuste de palabras, tablas desplazables en móvil, encabezados semánticos y pie con alcance/fecha. |
| Media | El Excel no tenía filtros, filas congeladas ni preparación de impresión; omitía notas de contexto de las secciones. | Filtros, congelación de encabezados, notas conservadas, texto ajustado, márgenes, A4, repetición de títulos, encabezado y paginación. Identificadores y textos que comienzan por `=` se conservan como texto literal, sin convertirlos en fórmulas. |

## Qué significan las cifras

- La jornada automática continúa en **10 horas por trabajador-día** de asistencia o tardanza. Descanso e inasistencia suman cero. Se conserva la última corrección del mismo trabajador y día. Es una regla operativa existente, no una medición de tiempo real ni una certificación de jornada legal.
- Los registros manuales históricos de horas mantienen la prioridad anterior: la asistencia registrada sustituye el total manual del mismo mes en el tablero. El reporte general calcula horas a partir de asistencia dentro de su alcance. No se suman ambas fuentes.
- La nota de aprobación sigue en **15/20**, la matriz IPERC sigue en **3×3** y el catálogo EPP sigue con **casco, lentes, guantes, ropa y zapatos**. No se modifican criticidades ni bloqueos de vehículos.
- El tablero de capacitación agrupa sesiones por fecha y tema normalizado. El reporte general conserva sus totales históricos de registros individuales por colaborador y lo explica en una nota. Ninguno acredita duración, competencia o una capacitación formal solo por contar una asistencia.
- Los filtros de fecha afectan eventos. Colaboradores, seguros e IPERC son una fotografía de los datos guardados al generar el reporte; no constituyen una reconstrucción histórica. Al filtrar por una persona, se omiten las secciones sin vínculo individual (hallazgos, inspecciones e IPERC).

## Revisión normativa y límites

La [Ley 29783](https://www.gob.pe/institucion/congreso-de-la-republica/normas-legales/462576-29783) y la [Ley 30222](https://www.leyes.congreso.gob.pe/documentos/leyes/30222.pdf), que modifica entre otros su artículo 28, admiten registros electrónicos y mantienen la responsabilidad del empleador. La [Ley 31246](https://busquedas.elperuano.pe/dispositivo/NL/1966676-1) modifica los artículos 49 y 60; no convierte un catálogo fijo de cinco EPP en una lista suficiente para todos los puestos.

Los artículos 33 a 36 del [D. S. 005-2012-TR](https://busquedas.elperuano.pe/api/visor_html/781249-1) distinguen registros, contenido mínimo, conservación y acceso a información médica. La referencia general de conservación es 20 años para enfermedades ocupacionales, 10 para accidentes e incidentes peligrosos y 5 para los demás registros, sin automatizar aquí una depuración. La [R. M. 050-2013-TR](https://www.gob.pe/institucion/mtpe/normas-legales/288031-050-2013-tr) establece información mínima en formatos referenciales. Un resumen PDF/Excel de gestión no sustituye sus expedientes, investigaciones o anexos. Deben revisarse también las modificatorias: [compendio oficial de SERVIR](https://www.gob.pe/institucion/servir/informes-publicaciones/3572362-normatividad-relacionada-a-la-seguridad-y-salud-en-el-trabajo-sst), [D. S. 001-2021-TR](https://www.gob.pe/institucion/mtpe/normas-legales/1604628-001-2021-tr) y [D. S. 006-2022-TR](https://www.gob.pe/institucion/mtpe/normas-legales/3005450-006-2022-tr). El correo interno no realiza una notificación oficial al SAT.

Para minería se consultó la [edición 2026 del MINEM](https://www.gob.pe/institucion/minem/informes-publicaciones/5631689-reglamento-de-seguridad-y-salud-ocupacional-en-mineria-ed-2024), que declara actualización al **30/05/2024** e incorpora los D. S. 023-2017-EM y 034-2023-EM; no se presenta como una verificación exhaustiva de normas posteriores a ese corte. En su [texto oficial](https://cdn.www.gob.pe/uploads/document/file/6437172/5631689-rsso-reglamento-2026.pdf?v=1774646092), los artículos 71 y 74 vinculan capacitación al puesto/IPERC y sus constancias; el artículo 76 diferencia capacitación y reuniones previas de cinco minutos. El artículo 95 exige participación en IPERC continuo; una matriz resumida no lo reemplaza. Los artículos 374 y 375 relacionan equipos con especificaciones, mantenimiento y operadores autorizados. El alcance del [D. S. 034-2023-EM](https://www.gob.pe/institucion/minem/normas-legales/4990975-034-2023-em) fue contrastado en fuente oficial. La aplicabilidad concreta depende de actividad, puesto, riesgos y responsabilidades del titular.

## Riesgos pendientes que no se ocultan

1. La escala 3×3, la jornada de 10 horas y el indicador individual son convenciones internas existentes. No deben rotularse como conformidad legal ni usar sus porcentajes como autorización médica u operativa.
2. El reporte general conserva todas las pólizas históricas; un trabajador puede tener varias renovaciones. «Seguros vigentes» cuenta registros con fecha no vencida, no trabajadores únicos ni cobertura comprobada por aseguradora. La fecha de inicio, cobertura y vigencias superpuestas necesitan una revisión de pólizas específica antes de cambiar esa regla.
3. La capacitación heredada no tiene un identificador independiente de sesión: dos cursos distintos con el mismo tema y fecha pueden agruparse en el tablero. Resolverlo requiere un cambio de modelo con migración y revisión de registros, fuera de esta mejora incremental.
4. El PDF/Excel general no incorpora automáticamente archivos médicos, fotografías o firmas que el navegador no haya cargado. No se generan enlaces públicos a evidencias privadas para completar el resumen. Los generadores dedicados de vehículos y charlas conservan su flujo propio.
5. La información médica y el DNI aparecen en la exportación general existente. Antes de compartirla se debe revisar el destinatario y el alcance autorizado. No se afirma cumplimiento automático de confidencialidad por el aspecto del archivo.
6. La paginación real del PDF depende del motor de impresión del navegador. OOXML define encabezados/pies y repetición de filas; se requiere comprobar la impresión en el Excel utilizado por la organización. No se presenta una prueba estructural de XML como una validación visual de Microsoft Excel.

## Evidencia de pruebas

Antes de editar: `node --test metrics.test.js reports.test.js` ejecutó **101 pruebas: 95 correctas y 6 fallidas**. Las seis eran expectativas anteriores al catálogo EPP de cinco elementos y a las fichas actuales de hallazgos; no fallos introducidos en este trabajo. Se actualizaron los fixtures y expectativas al comportamiento de producción, con aserción explícita del catálogo, sin reducirlo ni cambiar las fórmulas.

Después de los cambios: **111 pruebas correctas**, incluidas las de fechas imposibles, vigencias desconocidas, no mutación del origen, intersección de filtros, corrección de asistencia, horas, texto seguro, notas y configuración de exportación. Se conservaron las pruebas de CRC y estructura ZIP de Excel. La revisión visual e integración de controles corresponde a la comprobación local de interfaz del trabajo principal.
