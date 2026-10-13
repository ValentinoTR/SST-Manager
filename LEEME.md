# SST Control — sincronización privada con Supabase

## Acceso

La aplicación usa Supabase para guardar registros y adjuntos privados. El alta pública está desactivada; cada cuenta debe crearse desde **Authentication → Users → Add user** en el panel del proyecto. Después inicia sesión en la aplicación con ese correo y contraseña. Usa la misma cuenta en tus dispositivos.

La primera sesión carga los registros que ya estuvieran guardados en el navegador y los copia a la nube si todavía no existe un estado remoto. Las sesiones siguientes cargan el estado de Supabase. Los cambios se guardan localmente y se sincronizan automáticamente; el indicador superior muestra el estado de conexión.

## Supabase

- `supabase-config.js` contiene la URL del proyecto y su clave pública, apta para el navegador. No agregues claves secretas ni `service_role` a este archivo.
- `supabase-schema.sql` crea la tabla de estado, el bucket privado de adjuntos y las políticas RLS. Ejecútalo una sola vez en SQL Editor si conectas otra instancia.
- La aplicación mantiene los adjuntos en una copia local y en el bucket privado `sst-attachments`. Admite archivos de hasta 10 MB.
- El estado y los archivos se limitan al usuario autenticado por políticas que comparan su ID con el propietario.

## Abrir y publicar

Para una revisión rápida, sirve la carpeta desde un servidor web o publícala en GitHub Pages. No necesita instalar paquetes ni compilarse. Evita abrirla desde otro dominio: el navegador separa los datos locales por dirección.

El logo se llama exactamente `relieper.webp` y debe mantenerse en la raíz, junto a `index.html`.

Al actualizar, publica juntos `relieper.webp`, `index.html`, `app.js`, `cloud.js`, `supabase-config.js`, `supabase-schema.sql`, `styles.css`, `metrics.js`, `reports.js`, `workspace.css` y `workspace.js`.

## Asistencia y horas hombre

En **Asistencia**, elige el mes y el colaborador, y abre **Ver calendario**. También puedes abrir la pestaña **Asistencia** en su ficha. Los días aparecen automáticamente según el mes y su fecha de ingreso; no es necesario crear un registro por día. Los días anteriores al ingreso están deshabilitados.

Marca los días que asistió. Cada asistencia o tardanza suma **10 horas hombre**; las inasistencias, los descansos y los días sin marcar suman cero. Quitar un check registra una inasistencia. Los cambios se guardan automáticamente y actualizan los totales del mes y del año. **Estado u observación** permite registrar una tardanza, descanso o nota sin duplicar el mismo día.

Los reportes mensual, anual, por persona y por área incluyen horas hombre por colaborador y un desglose por mes, también en PDF y Excel. Por ejemplo, 1 000 días trabajados entre todos los colaboradores equivalen a 10 000 horas hombre.

El tablero conserva los totales manuales antiguos de meses sin registros diarios. En cuanto se registra asistencia de un mes, muestra el cálculo de sus días y no suma el total manual anterior. Los reportes calculan las horas únicamente a partir de los registros diarios.

## Respaldos

En **Respaldos**, descarga el respaldo completo antes de restaurar o cambiar de instancia. Incluye registros y evidencias, así que guárdalo en un lugar privado. La restauración reemplaza los registros actuales, conserva una copia previa y sincroniza el resultado con Supabase.

## Verificación

- `node --check app.js`, `node --check cloud.js`, `node --check workspace.js` y `node --check supabase-config.js`.
- `node --test metrics.test.js reports.test.js`.
- La tabla y el bucket se crearon en la instancia `SST-Manager`; el proyecto `AO Nexus` no se modificó.
