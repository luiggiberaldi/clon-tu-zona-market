# Revisión del cliente · Demo / MVP

Fecha de revisión: 14 de septiembre de 2026, hora de Venezuela.

**Esta versión es una demo / MVP modificable, no una tienda habilitada para ventas reales.** Nombre, diseño, textos, catálogo, funciones y reglas comerciales pueden adaptarse. No se ha desplegado en Vercel ni se han aplicado migraciones, cuentas, cobros o correos reales.

## Resultados comprobados antes del primer envío

| Comprobación | Resultado | Alcance |
|---|---|---|
| TypeScript estricto y lint | Aprobados | Verificación local aislada, sin credenciales |
| Pruebas unitarias y componentes | 87 aprobadas en 8 archivos; salida 0 | Incluyen checkout habilitado con transporte simulado, estado del carrito y 24 casos del backend local |
| Migraciones y reglas SQL | 53 comprobaciones aprobadas; 4 migraciones | PGlite secuencial con roles sintéticos, no Supabase real ni concurrencia entre conexiones |
| Navegador escritorio | 16 escenarios aprobados en la última ejecución parcial | Catálogo/búsqueda/precios, registro, perfil/direcciones, pedido, referencia, recuperación, MFA, revisión de pago, catálogo administrativo, categorías y cobertura |
| Entrega de repartidor | Revisión dirigida pendiente | La acción retiró el pedido de la lista activa; la aserción buscaba una opción oculta. No se cuenta como aprobada sin reejecución |
| Móviles/tablets táctiles | En verificación | Se detectó un selector de zona de 38 px; corregido a 44 px. Pendiente cerrar matriz de tamaños y flujo completo |
| Build local de producción | Bloqueado, salida 1 | Compilación y TypeScript correctos, 23 páginas generadas; el servicio de protección de archivos falló en el empaquetado |
| Manual del cliente | PDF de 7 páginas revisado | Español, acceso, uso, funciones, seguridad de prueba, límites y personalización |

Las cifras no incluyen intentos interrumpidos como éxitos. Se conservan localmente ejecuciones fallidas y reejecuciones separadas. Las comprobaciones que aún no están cerradas no se presentan como completas. El resultado de GitHub Actions se debe consultar por commit; subir código no equivale a aprobar el build.

## Correcciones y medidas incluidas

- Origen local: se reconoce el Host de loopback exacto cuando Next.js reconstruye internamente la URL como localhost, sin confiar en cabeceras reenviadas ni aceptar orígenes externos.
- Backend local: validación de registros y campos permitidos, identificadores/procedencia protegidos, tarifas no negativas, parámetros de pedido validados y stock mediante ajuste auditado.
- Configuración existente: se permite guardar un registro de ajustes que no tenía fecha de creación sin alterar su identidad.
- Carrito: estado aislado por cuenta, descuento una sola vez, reintentos idempotentes y comprobación de carga real tras recargar.
- Categorías: se impide enviar el formulario antes de su activación en el navegador.
- Productos: desactivación reversible, reactivación explícita y acceso a edición de artículos inactivos.
- Diseño adaptable: controles principales de al menos 44 px en pantallas táctiles, diálogos acotados al alto disponible, menú móvil y moneda con ajuste de línea, navegación de tablets simplificada, controles del carrito con ajuste de línea, sin ocultar desbordamientos del documento.
- Demo/MVP y posibilidad de modificación indicadas en interfaz, README y manual. Buzón expresamente compartido, no privado.
- Archivo de entorno solo con variables y ejemplos públicos; bases locales, sesiones, registros, credenciales, rutas personales y artefactos excluidos de la publicación.
- `vercel.json` preparado para Next.js, `npm ci` y `npm run build`, con `git.deploymentEnabled=false`. No hay cron ni paso de despliegue automático.

## Acceso de revisión

Para el responsable técnico: instalar dependencias desde el lockfile y ejecutar `npm run dev:demo`. Abrir `http://127.0.0.1:3000/carabobo` en ese equipo. Las cuentas rápidas de cliente, administrador y repartidor solo existen en la base local; no sirven en producción.

Para el cliente: [manual en español](manual-cliente.pdf). No se entrega un enlace a una tienda pública porque no se ha autorizado desplegarla. Para abrir la aplicación desde otro equipo/móvil físico será necesario un staging privado autorizado; no exponer el servidor de desarrollo.

## Límites y pendientes de salida

1. Cerrar las pruebas de navegador y táctiles; contrastar después en dispositivos Android/iOS y Safari físicos. La emulación no prueba teclados nativos, todos los lectores de pantalla o todos los navegadores.
2. Validar el empaquetado de producción en un entorno sano o en GitHub Actions. No desactivar la protección local para fabricar una aprobación.
3. Aportar el proyecto Supabase autorizado, variables privadas mediante canal seguro, dominio, correo/SMTP, Storage y cuentas de personal. No adjuntar secretos a este repositorio.
4. Aplicar migraciones en el entorno autorizado y probar concurrencia PostgreSQL, Auth/MFA, recuperación, correo, Storage, restauración y mantenimiento.
5. Confirmar catálogo y permisos de las imágenes, identidad comercial, cobertura, tarifas, horarios, tasa y medios de pago. Los 29 productos y 55 imágenes son una muestra capturada de la fuente; no disponibilidad en vivo ni afiliación.
6. Programar mantenimiento y aprobar términos/privacidad antes de ventas. Tarjetas, Prime, Zelle, recargas, envío real y compra offline no están habilitados.

La configuración de Vercel está documentada en [ENTORNO-Y-VERCEL.md](ENTORNO-Y-VERCEL.md). Su preparación no autoriza despliegues ni operaciones comerciales.
