# Inspección pre uso RELIPER

Referencia: imagen del formato de vehículos livianos proporcionada por el propietario el 1/11/2026. El formulario y el PDF conservan sus cuatro bloques, 39 componentes, 11 preguntas de somnolencia/fatiga, datos de conductor/empresa, kilometrajes, combustible, pausas, firmas y observaciones separadas. Se añade N/A para conservar las tres respuestas del sistema; exige justificación y no se admite en controles críticos.

El código, la versión y la fecha de aprobación oficiales se dejan vacíos hasta que la empresa los asigne. `reliper-light-v1` identifica la estructura digital, no representa una aprobación documental. Los teléfonos y rutas iniciales proceden de la imagen y se pueden corregir por registro. Deben comprobarse para cada unidad.

## Conservación y validación

- No se cambian filas antiguas, claves, tablas de usuarios, roles ni buckets. Los documentos sin `template` conservan el formulario/PDF anterior y pueden corregirse con nuevas revisiones. El formato de un documento existente no puede reemplazarse.
- Las inspecciones nuevas usan `template: reliper-light-v1` y el detalle en `payload.reliper`. El servidor normaliza etiquetas, colores y criticidad contra el catálogo y recalcula las 14 categorías históricas para mantener el bloqueo, la cola, las versiones y los episodios de fallas existentes. Los resúmenes de categoría pueden abreviarse a 1500 caracteres; el detalle original completo permanece en `reliper.components` y sus anexos.
- Los puntos de color se transcriben del papel. Las categorías críticas anteriores (incluido el extintor verde y determinados elementos amarillos) mantienen su criticidad. Cualquier otro elemento puede elevarse a crítico por IPERC; el cliente no puede reducir los mínimos del servidor.
- Un NO en las primeras cinco preguntas o un SÍ en las seis siguientes registra `fatigueStop` y bloquea el resultado de esa operación. No se crea una avería mecánica permanente a partir de esa declaración. Una inspección posterior no levanta averías críticas anteriores. No es una evaluación clínica, autorización médica ni certificación de cumplimiento legal. La referencia a seis horas transcribe el formato y no certifica un mínimo legal universal de descanso.
- Las pausas registradas requieren lugar, hora y duración de al menos cinco minutos; los campos vacíos no acreditan una pausa realizada. Las firmas trazadas son opcionales, pendientes cuando falten y sin certificación criptográfica. El supervisor debe identificarse si adjunta firma.
- Fotos y firmas se guardan como nuevas evidencias privadas en `sst-safety`, bajo el UID del propietario. Las revisiones anteriores conservan sus rutas. No se añaden privilegios sobre registros o archivos. La vista de aptitud continúa como `security_invoker` y las nuevas funciones de trigger permanecen en `sst_private`.

## PDF

Primera hoja A4 con la distribución de RELIPER. Anexos para trazabilidad del servidor, observaciones largas, fotos, pausas adicionales y fallas pendientes. Si un texto no cabe en su casilla, esta remite al anexo con el valor completo. El PDF conservado por versión y el adjunto automático usan el mismo generador. Los reportes anteriores mantienen su generador original.

`output/pdf/reliper-inspeccion-muestra.pdf`, generado por las pruebas, contiene información ficticia y no registra datos en producción. No distribuirlo como un acta real.

## Activación en producción

Proyecto correcto: **dxhlobdjcfhjatyxrntx**. No instalar en otro proyecto de la conexión MCP.

1. Ejecutar `node tests/bundle-edge.mjs` y desplegar `tmp/sst-reports.ts` como actualización de **sst-reports**, manteniendo su configuración de autenticación y secretos. Alternativamente, el CLI puede desplegar la fuente y sus imports relativos.
2. Aplicar únicamente `supabase/migrations/20261101174432_reliper_vehicle_template.sql` en la instancia que ya tiene las migraciones anteriores. Es aditiva, transaccional y no modifica registros existentes. No volver a ejecutar los SQL de instalación antigua.
3. Verificar `select public.sst_reliper_ready();` y los Advisors. Publicar/actualizar el frontend de esta misma versión. La comprobación de disponibilidad conserva el formulario anterior si la migración todavía no está instalada.
4. Comprobar una inspección autorizada, su consulta histórica y el PDF. La actualización de formato no completa ni sustituye la autorización pendiente de Gmail; no declarar correo operativo sin una prueba real.

Para instalaciones nuevas, aplicar todas las migraciones en orden. La versión de funciones del panel debe corresponder con la del repositorio. No almacenar credenciales de Google/Supabase en archivos públicos.

## Verificación

`npm test` incluye pruebas PostgreSQL embebidas de compatibilidad, conservación del historial, rechazo de cambio de formato, normalización de respuestas manipuladas, bloqueo por fatiga, fallas críticas persistentes, evidencia ajena y RLS. Se prueban el catálogo completo, las once condiciones de detención y el PDF A4 con textos extensos y fotografías. El catálogo SQL debe coincidir con `reliper.mjs`; al modificarlo, regenerar con `node tests/build-reliper-sql.mjs` antes de aplicar una nueva migración.

La ruta local `/__test__` usa 20 trabajadores y un vehículo ficticios; los documentos de esa ruta están en memoria y se pierden al recargar. Nunca se conecta al backend real ni envía mensajes. Permite revisar el formulario, el guardado simulado, el historial y las versiones.

`/__test__?legacy=1` simula una instancia que todavía no tiene la migración y comprueba que sigue disponible el checklist anterior. No modificar una migración ya aplicada para cambiar un catálogo: crear otra migración y otra versión de formato; el generador de esta migración solo corresponde a su preparación inicial.
