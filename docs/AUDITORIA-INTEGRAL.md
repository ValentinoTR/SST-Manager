# Auditoría técnica, funcional y visual de SST-Manager

Revisión del 1 de noviembre de 2026. Rama: `codex/auditoria-interfaz-sst`, creada desde el trabajo conservado en `codex/reliper-preuso` (`a24b856`). No se publicaron estos cambios, no se ejecutaron migraciones en producción ni se enviaron correos durante esta revisión.

## Arquitectura conservada

El sitio es una aplicación estática para GitHub Pages, sin compilación ni framework. `index.html` define las páginas y formularios; `styles.css` contiene los estilos históricos y `workspace.css` el sistema visual compartido. `app.js` controla los módulos originales, IndexedDB y la copia local. `metrics.js` calcula indicadores y `reports.js` crea HTML imprimible y Excel OOXML. `workspace.js` añade navegación, búsqueda, temas y respaldos; `workspace-core.js` aporta funciones puras para filtros, CSV y validación de respaldos.

`cloud.js` usa Supabase Auth, una fila JSON por usuario en `sst_app_state` y el bucket privado `sst-attachments`. `safety.js`, `safety-core.js` y `reliper.mjs` conservan vehículos y charlas en tablas separadas con versiones, auditoría, fallas y el bucket privado `sst-safety`. Las Edge Functions generan PDF y procesan la cola de correo; OAuth guarda sus credenciales en el servidor. No se incorporaron dependencias nuevas ni claves privadas al frontend.

Las copias de SQL en la raíz sirven como instalación histórica y las migraciones como historial de despliegue. Se detectó esa duplicación intencional; no se borraron ni alteraron migraciones ya existentes para limpiarla. Cambios de esquema futuros deben añadirse mediante una migración nueva.

## Prioridades y correcciones

| Prioridad | Problema observado | Cambio preparado |
| --- | --- | --- |
| Crítica | El JSON completo se guardaba con `upsert` sin comprobar la versión, perdiendo cambios de otro dispositivo. | Escritura condicional por propietario y `updated_at`, cola serializada, reconocimiento de respuestas perdidas y conflicto visible. Nunca se decide automáticamente qué versión debe ganar. |
| Crítica | Una cola, caché o respuesta de una cuenta podía reutilizarse al cambiar a otra. | Contexto por UID y generación, caché con propietario, invalidación de respuestas tardías, limpieza de vistas y notificaciones de Auth. El espejo local antiguo se conserva como recuperación explícita. |
| Alta | Se borraban archivos antes de confirmar el cambio del JSON, incluso si la escritura encontraba un conflicto. | Eliminación lógica del vínculo y conservación de originales privados y caché. No hay purga automática; la retención física requiere una decisión administrativa con respaldo. |
| Alta | Un error al cargar un adjunto podía guardar el registro sin la evidencia solicitada. | La operación se detiene con error y conserva el formulario. Se comprueba la cuenta después de operaciones asíncronas. |
| Alta | El respaldo exportaba todos los binarios del navegador y la restauración sustituía datos antes de subir archivos. | Solo recoge referencias de la cuenta; remapea IDs de archivos, valida estructura y duplicados, comprueba adjuntos y sube nuevos originales antes del cambio de estado. Conserva copia previa y distingue resultado remoto incierto. |
| Alta | Fechas inexistentes o ausentes se mostraban como vigencia confirmada. | Cálculo compartido que marca fecha inválida/desconocida. No se inventan duraciones legales ni se modifican registros anteriores. |
| Alta | Un control marcado adicionalmente como crítico por IPERC aceptaba «No aplica» en el checklist heredado. | Validación equivalente en interfaz, núcleo y nueva migración aditiva para escrituras futuras. Los episodios críticos abiertos siguen bloqueando la aptitud. |
| Media | Los gráficos dependían del HTML de tablas filtradas de otros módulos e interpolaban texto editable. | Gráficos derivados de registros de origen, texto mediante nodos DOM y filtros de alcance explícitos. No se leen cifras de otra tabla para recalcularlas. |
| Media | Lista de charlas demasiado ancha, sin búsqueda ni filtros conservando selecciones. | Tarjetas de personal, filtros combinados, convocatoria de visibles, asistencia individual y resumen global en vivo. Nadie empieza presente por defecto. |
| Media | Carga fallida de módulos nuevos borraba la última consulta. | Conserva caché de la misma sesión, indica fecha de la consulta y ofrece actualización. Una sesión distinta nunca reutiliza esos datos. |
| Media | Navegación, colores, tamaños de texto y formularios sin tema común. | Paleta RELIPER, superficies compartidas, modo claro/oscuro, menú plegable, menú móvil con `inert`, foco visible y controles con etiquetas. |
| Media | PDF/Excel generales sin filtros combinables ni configuración de impresión uniforme. | Intersección de periodo, área y trabajador; tablas A4, notas de alcance, filtros y encabezados congelados en Excel. |

## Revisión por módulo

| Módulo | Contratos y comportamiento preservados | Mejora y verificación |
| --- | --- | --- |
| Colaboradores | IDs, DNI/documento, ficha, estado y datos personales/laborales. | Formularios etiquetados y protegidos ante doble envío. Alta y corrección con datos sintéticos; texto con apariencia de HTML se conserva como texto. CSV neutraliza fórmulas. |
| Asistencia | Calendario mensual, última corrección por persona/día y jornada operativa de 10 horas. | Tablero y tendencia usan registros reales del alcance; días sin registro aparecen sin porcentaje. Pruebas de calendario, duplicados, correcciones y horas. |
| EPP | Catálogo de cinco elementos, entregas, renovaciones, evidencias e historial. | Tablas/controles comunes, vencimientos inválidos visibles y alcance por área. No se elimina el catálogo ni se cambia su suficiencia técnica por puesto. |
| Seguros | SCTR, Vida Ley y renovaciones históricas. | No se cuenta como vigente una póliza sin vencimiento válido. El reporte conserva las filas históricas; no se presenta su total como personas únicas cubiertas. |
| Capacitaciones | Agrupación existente de sesiones y notas de aprobación. | Se corrige el rótulo que las confundía con charlas diarias; metas y cursos siguen en su propia colección. |
| Exámenes médicos | Registro, resultado, documentos y vencimientos. | No se deduce vigencia de fechas desconocidas. Se conserva el aislamiento por cuenta; el límite de permisos clínicos se detalla abajo. |
| Hallazgos | HPH, HPI, mejora continua, estado y levantamientos. | Filtros del tablero y estilos compartidos; cálculos y exportaciones cubiertos por pruebas existentes. |
| Inspecciones generales | Observaciones, cierre, reapertura y evidencias de levantamiento. | Mejor lectura y controles móviles; el filtro del tablero no altera registros ni criterios de cierre. |
| Incidentes y accidentes | Investigación, acciones, estado y contador de último evento. | Fechas civiles inválidas no reinician el contador; se conservan investigación e historial. |
| IPERC | Matriz 3×3, jerarquía de controles y riesgo residual. | Presentación común y filtro por área; no se cambian probabilidad, severidad ni umbrales. |
| Programa anual | Planificación, ejecuciones, evidencias y avance a la fecha. | El indicador sigue el año seleccionado y conserva alcance general, sin asignarlo ficticiamente a un área. |
| Reportes y estadísticas | Cuatro alcances, HTML imprimible, OOXML y datos de origen. | Filtros combinados, notas, tablas y seguridad de texto. Véase la auditoría específica. |
| Vehículos | Checklist histórico de 14 componentes y RELIPER de 39, fotos, fatiga, fallas, correcciones y PDF. | Categorías, progreso, controles críticos y diálogo responsive. No se degradan criticidades ni se cierran fallas por guardar una inspección conforme. |
| Charlas diarias | Convocados, presentes, ausentes, evidencia opcional/obligatoria, firmas y versiones. | Búsqueda por nombre/DNI/cargo/área, filtros sin borrar selecciones y resumen ponderado. 18 de 20 produce 90 %. No se equipara asistencia con acreditación. |

No se añadió un segundo módulo para una función ya existente ni se cambió el modelo de registros para un ajuste estético. Las acciones de alta, corrección, eliminación, cierre o archivo siguen las que ofrece cada módulo; esta revisión no convierte todos los registros antiguos en un sistema uniforme de edición/versionado.

## Interfaz y rendimiento

La navegación conserva páginas, IDs, `data-action` y eventos. El menú puede plegarse en escritorio; en móvil, los controles fuera de pantalla quedan inactivos hasta abrirlo. La búsqueda global admite teclado y devuelve el foco al contenido. Se respetan preferencias de movimiento reducido. Los temas comparten tokens de fondo, tarjeta, borde, texto y estado.

El tablero usa una copia filtrada del estado, sin modificar el origen. El periodo afecta eventos; EPP, seguros, alertas y trabajadores reflejan los datos actuales. Las metas y programa son generales. Horas manuales globales no se reparten artificialmente por área. Se retiró la repetición visual del contador de trabajadores en las fichas inferiores, conservando su cálculo y el contador principal. La tendencia compara porcentajes solo cuando ambos meses tienen registros.

Se sustituyeron observadores sobre tres tablas y temporizadores de refresco de gráficos por un evento tras actualizar el tablero. Las firmas de asistentes crean su contexto de dibujo cuando se usan. El historial grande sigue paginando consultas en bloques de 500; cargar todas las filas conserva los filtros y exportaciones existentes, pero deberá revisarse con volúmenes reales altos antes de afirmar escalabilidad ilimitada.

## Seguridad, persistencia y límites

- RLS y rutas privadas de vehículos/charlas se comprobaron con PostgreSQL local (PGlite), incluyendo otro usuario, revisión inválida, evidencia ajena y cola. No se presenta esto como un nuevo análisis de Advisors de la base real.
- Auth invalida vista y colas al salir o cambiar UID; renovar el token no recarga sobre cambios locales pendientes. La aplicación no usa `user_metadata` para decidir permisos.
- El control de concurrencia protege esta versión del cliente; un navegador con código antiguo o un cliente directo que ignore `updated_at` todavía puede sobrescribir la fila original. Antes de publicar se deben cerrar/actualizar las sesiones antiguas. Una protección obligatoria en servidor requiere una migración posterior, revisada y respaldada.
- El esquema original es una fila JSON privada por cuenta. No ofrece permisos por campo para separar resultados médicos de datos administrativos dentro de esa misma cuenta. Los roles de los módulos nuevos tampoco sustituyen políticas sobre el JSON antiguo. Para una operación compartida con personal médico/RR. HH./supervisores se necesita diseñar autorización y almacenamiento específicos; ocultar una columna no sería protección suficiente.
- La copia por UID y los adjuntos del navegador siguen siendo almacenamiento del dispositivo, no cifrado clínico ni sustituto del control de acceso al equipo. No debe compartirse una sesión ni un archivo de respaldo con datos personales sin autorización.
- El respaldo JSON de la interfaz corresponde a los módulos originales. No restaura las tablas, versiones, auditoría ni bucket de vehículos/charlas; su recuperación integral requiere respaldo de base y almacenamiento de Supabase por el administrador. Se corrigió el texto para no prometer una copia completa que no existía.
- Los originales privados desvinculados se retienen para recuperación. No se ejecutó ninguna purga de evidencia ni se definió automáticamente un plazo de conservación.
- Una sesión nueva necesita conexión para comprobar la versión remota. Los cambios pendientes ya guardados en la caché por UID se conservan, pero no se anuncia un modo totalmente offline.
- La revisión del correo ejecuta simulaciones de Gmail, permisos, cuota, timeout y respuestas inciertas; no genera mensajes adicionales. La conexión real confirmada antes de esta auditoría sigue siendo `educornejoperea28@gmail.com` → `seguridad@reliper.pe`. Su aplicación de Google seguía en «Prueba»; la configuración de producción y su vigencia deben resolverse por separado.

## Evidencia y pruebas

Antes de editar: suite de seguridad **30/30**, suite heredada **95/101**. Los seis fallos heredados correspondían a fixtures anteriores al catálogo EPP actual y expectativas de rótulos; se documentaron y actualizaron sin reducir requisitos. Las fórmulas operativas de horas, IPERC y capacitación permanecen.

Resultado final local: **161/161 pruebas correctas**, sin fallos, más comprobación de sintaxis y construcción del bundle de la Edge Function.

Las pruebas añadidas cubren: conflictos de dos dispositivos, respuesta de red perdida, cambio de UID, token renovado, cierre de sesión, caché de adjuntos, conservación ante eliminación, fallo de carga de evidencia, filtro por área sin mutación, CSV, respaldos maliciosos/duplicados y «No aplica» crítico en frontend/SQL. `npm test` agrupa ahora todas las suites para que CI también ejecute los controles heredados.

Se inspeccionaron las 15 páginas de navegación en escritorio y a 360 px sin desbordamiento del documento; las tablas mantienen desplazamiento interno. Formularios de charlas y RELIPER encajaron a **360, 390, 768 y 1440 px**. En la charla se marcaron individualmente 18 presentes, se buscó/filtró sin perder selecciones y se guardó en el backend simulado: **18 presentes, 2 ausentes, 90 %**. Se revisaron ambos temas, menú plegable, búsqueda por teclado, alta/corrección de un trabajador y vista previa del reporte en iframe.

La prueba del botón de eliminación llegó a su confirmación nativa; Chrome interrumpió la automatización y el usuario cerró esa confirmación. La lógica de eliminación y conservación de evidencia se verificó además en pruebas automatizadas. No se afirma haber completado todos los flujos de eliminación real mediante el navegador. Tampoco se aplicaron cambios a registros de producción para probarlos.

El PDF dedicado de vehículos/charlas y el formato RELIPER se generan en pruebas con firmas/fotos/textos largos. El reporte general se revisó como HTML imprimible; las partes XML/ZIP del Excel se validaron estructuralmente. La impresión final en el navegador y en Microsoft Excel requiere una revisión con el equipo y la impresora utilizados. No se confunde prueba estructural con certificación visual de impresión.

## Orden de activación, sin ejecutar producción

1. Conservar la rama y revisar su diff junto con [Formato RELIPER](FORMATO-RELIPER.md).
2. Crear y verificar un respaldo privado de la base, bucket y datos originales del proyecto correcto `dxhlobdjcfhjatyxrntx` antes de una autorización de despliegue.
3. En una instancia de prueba, instalar las migraciones pendientes, incluido `20261101174432_reliper_vehicle_template.sql` y después `20261101203143_safety_critical_applicability.sql`. La segunda no reescribe ninguna fila histórica.
4. Verificar Advisors, permisos/roles, generación del PDF servidor y lectura de versiones con las cuentas de prueba.
5. Cuando se autorice, activar primero el generador servidor compatible con RELIPER, después las migraciones y finalmente el frontend completo, incluido `workspace-core.js`. No basta copiar solo CSS o HTML.
6. Actualizar las sesiones antiguas antes de editar en varios dispositivos, revisar la conexión OAuth de producción y efectuar una prueba acordada sin repetir un envío de resultado incierto.

La normativa, fuentes oficiales, alcance de los registros y límites de confidencialidad están en [Auditoría de reportes](auditoria-reportes.md) y [Integración de seguridad](INTEGRACION-SEGURIDAD.md). Esta mejora no acredita cumplimiento legal automático.
