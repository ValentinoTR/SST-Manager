# Seguridad operacional, página independiente

Entrada: /SST-Manager/operaciones/. Solo **Inspección de vehículos** y **Charlas de seguridad**. Empieza vacía: no importa trabajadores, vehículos, historiales, evidencias ni ajustes de SST-Manager. La página original conserva todos sus módulos y registros.

## Separación de datos

La nueva web utiliza el mismo proyecto Supabase dxhlobdjcfhjatyxrntx y las mismas cuentas existentes, con recursos diferentes: tablas y funciones ops_*, esquema privado ops_private, bucket privado ops-safety y función de reportes ops-reports. Cada usuario conserva sus registros propios mediante RLS. Es separación de registros dentro del mismo proyecto, no otra instancia de Supabase ni una nueva frontera administrativa.

operaciones/client-scope.js limita las consultas del código compartido a estos recursos. La sesión usa reliper_operations_auth_v1 y la recuperación local reliper_operations_v1, sin leer el almacenamiento de SST-Manager. Cerrar sesión afecta la sesión actual de esta entrada.

El personal se registra una sola vez dentro de esta web y se reutiliza en las charlas. Admite correcciones e inactivación, conserva el historial y evita DNI repetidos. El servidor valida los datos y registra cambios. El guardado condicional impide que una pestaña antigua sobrescriba una versión más reciente.

Se reutilizan los formularios y reglas de safety.js, safety-core.js, reliper.mjs, cloud.js y metrics.js. No se cargan app.js, reports.js ni workspace.js. El único cambio funcional compartido es esperar el editor de trabajadores para gestionar errores asíncronos; también se aclaran dos mensajes del personal.

## Instalación del servidor

1. Ejecutar node tests/build-operations.mjs para regenerar la migración aditiva y supabase/functions/ops-reports/index.ts desde las reglas revisadas. La migración fue creada mediante supabase migration new operations_independent_records.
2. Desplegar ops-reports con la configuración de supabase/config.toml: valida en su interior el JWT del usuario o el secreto privado de su propio planificador. No acepta solicitudes anónimas. node tests/bundle-edge.mjs genera tmp/ops-reports.ts para el editor del panel, sin credenciales.
3. Aplicar supabase/migrations/20261108014132_operations_independent_records.sql **solo en dxhlobdjcfhjatyxrntx**. Presupone pg_cron y pg_net del sistema actual. Crea recursos vacíos y un planificador independiente; no actualiza ni copia filas sst_*.
4. Comprobar RLS, bucket privado, vista de aptitud, cron y ausencia de registros iniciales. Comparar los registros originales antes y después.
5. Publicar la carpeta operaciones/ junto a los archivos compartidos en GitHub Pages.

El destinatario inicial es seguridad@reliper.pe y el remitente educornejoperea28@gmail.com. Se conserva la autorización Gmail cifrada existente en el servidor, sin trasladarla al navegador. Ambas colas son independientes. Gmail debe mantener una autorización vigente; un consentimiento de Google en modo de prueba puede requerir renovación. No se declara un correo entregado por estar en cola: Enviado significa aceptación por el proveedor.

La ruta administrativa POST /health de ops-reports exige exclusivamente el secreto de su planificador. Comprueba la autorización de Gmail sin enviar mensajes, reclamar trabajos ni devolver credenciales. Responde disponibilidad o indisponibilidad; no es un diagnóstico accesible desde el navegador.

## Verificación del servidor · 7 de noviembre de 2026 (Lima)

Se instaló la migración y se desplegó ops-reports en el proyecto correcto mediante la CLI oficial autorizada. Las nueve tablas nuevas tienen RLS, el bucket es privado, la vista utiliza security_invoker y el planificador separado está activo cada minuto. Ningún recurso nuevo admite lectura anónima ni borrado de registros por el usuario.

Se probó el guardado real de personal, inspección RELIPER, corrección, bloqueo por falla crítica, charla con 20 convocados y 18 presentes, versiones y cola en una transacción completamente revertida. No se dejaron filas de prueba ni se enviaron correos. Todas las tablas operativas y evidencias nuevas quedaron vacías.

Los diez controles de integridad (nueve tablas originales y el inventario de 31 archivos existentes) coinciden antes y después de la instalación. Las funciones originales permanecen en sus versiones anteriores. El asesor de seguridad no añadió avisos respecto de los tres preexistentes.

El servicio desplegado devolvió HTTP 401 sin sesión y HTTP 403 con origen ajeno. La comprobación privada de Gmail y el procesamiento autorizado de la cola vacía respondieron HTTP 200. Se verificó autorización vigente, sin afirmar entrega de un reporte operacional que aún no existe.

## Vista previa y verificación

npm run preview sirve /operaciones/ con autenticación real y /operaciones/__test__ con un simulador vacío. SST_PREVIEW_PORT permite elegir puerto. La ruta de prueba solo existe localmente, borra sus datos al recargar y no envía correos.

npm test cubre las reglas existentes y las pruebas de separación: recursos exclusivos, DNI único, historial, guardado concurrente, RLS, evidencias separadas, cola propia y conservación de los datos originales. Las pruebas de PostgreSQL se ejecutan en PGlite con un planificador simulado; no sustituyen la comprobación del despliegue real.
