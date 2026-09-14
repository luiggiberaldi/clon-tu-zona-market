# Mercado Cercano · Demo / MVP modificable

Tienda de un comercio y un almacén, con marca configurable, catálogo público en español, carrito, checkout, administración y reparto asignado. Next.js App Router + Supabase PostgreSQL/Auth/Storage. Tarjetas, Zelle, Prime y recargas permanecen desactivados.

**Estado:** demo / MVP para revisión del cliente. **Todo es modificable:** marca, diseño, textos, catálogo, cobertura, reglas comerciales y funciones. No activar ventas antes de completar los controles de staging. Una compilación y pruebas locales correctas no verifican Auth/Storage remotos ni la concurrencia real de PostgreSQL.

- [Guía de variables de entorno y Vercel, sin credenciales](docs/ENTORNO-Y-VERCEL.md)
- [Manual del cliente en español (PDF)](docs/manual-cliente.pdf)
- [Pruebas, limitaciones y pendientes de revisión](docs/REVISION-CLIENTE.md)

La preparación para Vercel **no es un despliegue**. Los despliegues Git automáticos están desactivados en `vercel.json`; el flujo de GitHub Actions solo verifica calidad.

## Ejecutar

Requiere Node **>=22.22.2 y <25**. El archivo de dependencias bloqueadas corresponde a esta versión; reinstala las dependencias si conservas las del proyecto anterior.

```bash
npm ci
npm run dev:demo
```

Abre `http://127.0.0.1:3000/carabobo` y mantén la terminal abierta. El demo local incluye una selección de **29 artículos y 55 imágenes originales de TuZonaMarket**, cotejados por nombre, SKU y ficha. No es su catálogo completo ni disponibilidad en tiempo real. La procedencia y fecha de captura pueden consultarse en `/demo/procedencia` y en cada producto.

La barra superior permite entrar como **cliente**, **administrador** o **repartidor de prueba**. También puedes registrar una cuenta local. Para el administrador: configura el autenticador local en Seguridad, obtén el código de prueba, escríbelo y verifícalo. El servidor valida TOTP; este generador expuesto es solo para facilitar el demo.

- Carrito, registro/login, perfil, direcciones, cotización, horarios, pedidos, referencias, revisión de pagos, devoluciones, reparto y administración utilizan almacenamiento local persistente.
- `/demo/buzon` recibe la recuperación de contraseña, consultas y notificaciones de pedidos. No sale correo externo. Los enlaces de recuperación son de un solo uso.
- Las cuentas de acceso directo son `customer@demo.local`, `admin@demo.local` y `driver@demo.local`, con contraseña inicial **`DemoLocal2026`**. Existen solo en esta base de prueba; las cuentas registradas eligen su contraseña.
- La base se guarda en `.workbuddy-ai/demo-local/mercado-demo-v3.sqlite`, salvo `DEMO_DATA_DIR` explícito. Conserva ese directorio: no es caché. El carrito y la moneda se conservan en el navegador.
- Cobertura, tarifas de entrega y cupos iniciales son **simulados** y están identificados como tales. Los precios y existencias iniciales son capturas de la fuente; las operaciones posteriores solo cambian la copia local. La tasa capturada no se presenta como cotización en vivo.
- No hay cobros, envíos, órdenes a TuZonaMarket ni cambios remotos en Supabase. Usa datos y contraseñas de prueba, nunca información privada real. El buzón es compartido por quien use esta instalación local.
- `dev:demo` limpia las credenciales de servicios en su proceso hijo y escucha únicamente en `127.0.0.1`. El backend local rechaza producción y solicitudes ajenas al origen local. No se activa por falta de credenciales.

Para detenerlo: `Ctrl+C`. Si el puerto está ocupado, define otro `PORT` antes de iniciar; no cierres procesos ajenos. El error del servicio de protección de archivos de WorkBuddy debe resolverse sin desactivarlo; si bloquea el entorno del asistente, puedes iniciar este mismo comando en tu terminal.

Para la tienda real, copia `.env.example` a `.env.local` sin sobrescribir configuraciones existentes y completa los valores. Ejecuta `npm run dev`. Nombre, correo, teléfono y URL se configuran con `NEXT_PUBLIC_STORE_*`, `NEXT_PUBLIC_SUPPORT_*` y `NEXT_PUBLIC_SITE_URL`; cambiar variables públicas requiere reconstruir el frontend.

No expongas `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CRON_SECRET` ni claves de correo con prefijo `NEXT_PUBLIC_`. No se han activado cuentas, servicios ni migraciones remotas durante la implementación.

## Instalar o actualizar Supabase

1. Configura URL y clave pública de Supabase, clave de servicio y `DATABASE_URL`. La conexión PostgreSQL se usa solo desde herramientas de despliegue, con TLS verificable fuera de localhost.
2. Base nueva: `npm run migrate`. Aplica **todos** los archivos de `supabase/migrations/` en orden, con checksum y transacción por archivo.
3. Esquema original existente: primero realiza una copia de seguridad y verifica su restauración. Compara el baseline antes de `npm run migrate -- --adopt-existing-baseline`. No uses esta opción en un esquema desconocido. `schema.sql` falla deliberadamente para impedir una instalación antigua insegura.
4. Configura Email Auth, confirmación de correo, SMTP propio y redirecciones de tu dominio, incluyendo `/auth/callback` y `/auth/callback?next=/actualizar-clave`. Habilita inscripción y verificación TOTP en Supabase.
5. Google es opcional: permanece oculto salvo `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true` y requiere configurar el proveedor y sus redirecciones.

El esquema conserva pedidos históricos. Solo los nuevos pedidos transaccionales marcan inventario reservado; cancelar un pedido antiguo no fabrica unidades. Las direcciones del historial se conservan y sus snapshots no cambian al editar una dirección guardada.

## Alta de personal

Registra y confirma primero una cuenta. Configura `ADMIN_EMAIL` y ejecuta conscientemente:

```bash
npm run bootstrap:admin -- --confirm
# Para una cuenta de reparto:
npm run bootstrap:admin -- --driver --confirm
```

En la tienda conectada a Supabase no hay contraseñas ni administradores predeterminados (las cuentas citadas arriba pertenecen solo al demo local). El administrador debe vincular un autenticador y verificar el segundo factor en `/perfil/seguridad`. MFA también se exige en los RPC directos de administración, no solo en la interfaz.

## Configuración comercial

- `/admin/configuracion`: tasa USD/VES, franjas de dos horas, cupos, anticipación, horizonte de hasta 7 días y corte del mismo día (America/Caracas).
- `/admin/zonas`: cobertura activa, tarifa y mínimo de compra por ciudad.
- `/admin/categorias` y `/admin/productos`: catálogo real, precio final con impuestos aplicables, ofertas, imágenes y stock. El stock de productos existentes se ajusta por separado con motivo auditado.
- Efectivo, PagoMóvil y transferencia empiezan **deshabilitados**. Introduce instrucciones reales y moneda antes de habilitarlos.
- El carrito conserva precios base y aplica el descuento una sola vez. El servidor vuelve a cotizar y rechaza cambios de total o tasa no aceptados. La entrega depende de la dirección guardada, no de la zona de navegación.
- `price_ves` es un campo histórico, no una fuente de cobro. Sin tasa positiva publicada en las últimas 24 horas, se bloquea la compra y los precios vuelven a USD.

## Pedidos, pagos y reservas

La creación transaccional valida propiedad, cobertura, inventario, precio, tasa, horario y cupos. Una clave idempotente recupera respuestas interrumpidas sin duplicar pedidos. Se guardan snapshots de dirección, precios e instrucciones.

Una referencia **no confirma el pago**. Un administrador con MFA verifica el ingreso real, deja una nota y aprueba o rechaza. Registrar una devolución no mueve dinero: el operador debe haberla ejecutado. Para cancelar un pedido pagado, registra antes la devolución.

Transferencia/PagoMóvil: reserva de 30 minutos sin referencia; hasta 24 horas de revisión tras enviarla, limitada a 24 h 30 min desde la creación. Los reintentos idénticos no generan eventos nuevos; los cambios tienen espera y límite. Cancelación y vencimiento restituyen stock una sola vez.

Efectivo: las reservas no vencen automáticamente; el comercio debe revisar y cancelar pedidos abandonados. Se permiten hasta cinco reservas pendientes impagas por cuenta. El pedido puede prepararse sin pago, pero no marcarse entregado hasta que un administrador registre el cobro. Repartidores: solo pedidos asignados.

## Mantenimiento y correo

`GET /api/interno/mantenimiento` requiere `Authorization: Bearer <CRON_SECRET>` (mínimo 32 caracteres). Expira reservas y procesa el outbox si existen `RESEND_API_KEY` y `EMAIL_FROM`. Sin correo, conserva los eventos.

No hay un cron activo en `vercel.json`: se retiró la propuesta automática de cada cinco minutos para no activar operaciones ni asumir compatibilidad del plan. Antes de ventas, programa este endpoint expresamente con una frecuencia admitida por el proveedor y configura alertas de fallos/cola detenida. El cron y el envío real no se activaron ni verificaron localmente. El SMTP de Auth es independiente del correo de pedidos.

## Calidad

```bash
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
npm run preflight
```

`test:db` ejecuta migraciones y pruebas negativas/positivas en PGlite con roles Auth sintéticos, sin servicios remotos. Las pruebas son secuenciales y no demuestran contención entre conexiones. CI revisa también dependencias y archivos sensibles. Su comprobación de secretos requiere un repositorio Git; el directorio entregado puede no estar inicializado como repositorio.

## Despliegue y controles de salida

- Vercel: importa el repositorio, selecciona Node compatible, configura variables y crea staging. No subas `.env.local`. El webhook antiguo de tarjetas devuelve 410 y no procesa eventos.
- Docker: `docker compose --env-file .env.local build`, luego `docker compose --env-file .env.local up -d`. Variables públicas en build, privadas en ejecución. El puerto del host se publica en `127.0.0.1:3000`; un proxy HTTPS proporciona acceso externo. Supabase se despliega por separado.
- El service worker antiguo se retira para impedir caché de respuestas privadas. No hay compra offline.
- Antes de ventas: backup/restauración, migraciones/RLS, Auth/SMTP/MFA, Storage, catálogo, cobertura, tasa, pagos, cron, HTTPS, términos/privacidad del comercio y límites/alertas de infraestructura.
- Staging con dos clientes: última unidad simultánea, último cupo de franja, aprobación frente a vencimiento, doble cancelación, cambio de cuenta y edición de dirección al confirmar. Comprueba también registro, recuperación de contraseña, correo real y acceso ajeno denegado.

Los documentos de roadmap históricos no son una lista de funciones activas. Las condiciones y datos reales del comercio deben revisarse antes de publicar.
