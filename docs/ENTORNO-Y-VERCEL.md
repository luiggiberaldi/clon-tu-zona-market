# Entorno y preparación para Vercel

## Estado y alcance

Este proyecto es una **demo / MVP para revisión**. Marca, diseño, textos, catálogo, cobertura, reglas comerciales y funciones son modificables. Preparar el código para Vercel no significa que se haya desplegado ni que esté listo para ventas reales.

Hay dos modos diferentes:

1. **Demo local:** `npm run dev:demo`. Node 22.22.2 o superior, menor que 25. Funciona sin Supabase, con SQLite y cuentas de prueba. Escucha únicamente en `127.0.0.1`. No es accesible desde otro teléfono por Wi-Fi. El buzón, pagos y reparto son simulados. No introducir información privada real.
2. **MVP conectado:** `npm run build` y ejecución de producción. La demo SQLite y sus accesos rápidos están desactivados por diseño. Requiere Supabase configurado para tener catálogo, usuarios y pedidos. No se debe intentar habilitar SQLite en Vercel cambiando NODE_ENV.

## Variables públicas

Se configuran en el entorno de compilación y ejecución. Cualquier variable `NEXT_PUBLIC_*` puede aparecer en el navegador: nunca colocar secretos en ellas. Cambiarlas requiere reconstruir el frontend.

| Variable | Uso | Demo local | MVP conectado |
|---|---|---|---|
| `NEXT_PUBLIC_STORE_NAME` | Nombre completo de la marca | Opcional | Configurar |
| `NEXT_PUBLIC_STORE_SHORT_NAME` | Nombre corto | Opcional | Configurar |
| `NEXT_PUBLIC_SITE_URL` | URL absoluta del sitio, metadatos y redirecciones | La fija el lanzador al puerto local | URL HTTPS definitiva o de staging |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Correo de contacto visible | Vacío | Correo comercial público |
| `NEXT_PUBLIC_SUPPORT_PHONE` | Teléfono público de contacto | Vacío | Opcional |
| `NEXT_PUBLIC_DEMO_MODE` | Activa exclusivamente el demo en desarrollo | El lanzador usa `true` | `false` |
| `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` | Muestra acceso Google cuando esté configurado | `false` | `false` hasta configurar proveedor |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | El lanzador la vacía | Requerida |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública anon/publishable | El lanzador la vacía | Requerida; usar con RLS |

## Variables privadas

No se incluyen valores reales en el repositorio ni en el PDF. Guardarlas en las variables privadas del proveedor o en `.env.local` excluido de Git. No escribirlas en incidencias, capturas, mensajes de commit o registros.

| Variable | Uso y ubicación |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privilegiada, solo servidor. Necesaria para operaciones administrativas protegidas y mantenimiento. Nunca pública. |
| `DATABASE_URL` | Conexión PostgreSQL con TLS para herramientas de migración. No hace falta exponerla a la aplicación web ni guardarla en Git. |
| `ADMIN_EMAIL` | Cuenta ya registrada y confirmada a promover mediante el comando de alta, con confirmación explícita. No inventa una cuenta. |
| `CRON_SECRET` | Secreto de al menos 32 caracteres para mantenimiento. Generarlo de forma segura y guardarlo fuera del repositorio. |
| `RESEND_API_KEY` | Opcional: correo transaccional de pedidos. No sustituye SMTP de Supabase Auth. |
| `EMAIL_FROM` | Remitente verificado del correo de pedidos. |

## Variables de desarrollo y herramientas

- `PORT`: puerto local, por defecto 3000. Debe estar libre. No es necesario configurar PORT en Vercel.
- `DEMO_DATA_DIR`: directorio local persistente opcional. Por defecto `.workbuddy-ai/demo-local`. No subir su contenido: contiene cuentas, sesiones, pedidos y consultas de prueba. No borrarlo como si fuera caché.
- `SOURCE_EXTRACTOR_DIR` y `BROWSER_DRIVER_ENTRY`: rutas locales opcionales para el importador revisado. No se necesitan para arrancar el catálogo incluido ni se configuran en Vercel.
- `NEXT_TELEMETRY_DISABLED=1`: opcional para las comprobaciones automáticas.
- `NODE_ENV`: lo administra Next.js. No forzarlo a `development` en producción.

La muestra `.env.example` contiene nombres y valores públicos de ejemplo, no credenciales. Copiarla a `.env.local` solo si este archivo no existe; no sobrescribir una configuración anterior.

## Preparación de Vercel sin despliegue

La configuración incluida utiliza:

- Framework: Next.js.
- Directorio raíz: raíz del repositorio.
- Instalación: `npm ci`.
- Compilación: `npm run build`.
- Runtime: seleccionar Node 22.x compatible con `engines` en `package.json`.
- Directorio de salida: predeterminado de Next.js, sin override manual.
- `git.deploymentEnabled: false`: impide despliegues automáticos desde Git en todas las ramas.

**No se ha ejecutado un despliegue.** No habilitar despliegues automáticos ni pulsar Deploy durante esta revisión. Tras autorización, configurar un proyecto de staging, variables y protecciones de acceso. Después, habilitar explícitamente la integración Git o realizar el despliegue autorizado.

Fuente de la configuración: https://vercel.com/docs/project-configuration/git-configuration (consultada el 13/09/2026, hora de Venezuela).

## Antes de conectar servicios reales

1. Confirmar proyecto Supabase, titular y permisos; preparar backup/restauración si ya contiene datos.
2. Aplicar las cuatro migraciones en orden, en un entorno autorizado. No ejecutar `schema.sql` aislado.
3. Configurar Auth, confirmación de correo, redirecciones `/auth/callback`, recuperación de contraseña y SMTP. Google es opcional.
4. Promover al personal con el procedimiento documentado en README y exigir segundo factor al administrador.
5. Configurar Storage e imágenes, catálogo propio o con permiso, políticas RLS, cobertura, horarios, cupos y mínimos.
6. Publicar una tasa válida y habilitar conscientemente las instrucciones de pago. Una referencia no confirma un cobro.
7. Revisar términos, privacidad, titularidad de fotos/marcas y mensajes de demo antes de cualquier lanzamiento comercial.
8. Probar en PostgreSQL real la última unidad, último cupo, aprobación frente a vencimiento, doble cancelación y direcciones concurrentes.
9. Configurar mantenimiento y correo, alertas, copias y recuperación.

## Mantenimiento: no está programado

El `vercel.json` no contiene cron activo. Se retiró la propuesta automática de cada cinco minutos para no activar operaciones ni asumir que el plan de Vercel admite esa frecuencia.

El endpoint `GET /api/interno/mantenimiento` existe y exige `Authorization: Bearer <CRON_SECRET>`. Expira reservas y procesa eventos de correo cuando está configurado. Antes de ventas, seleccionar un plan/proveedor compatible y programarlo expresamente. Sin esta tarea, la tienda conectada no garantiza liberar las reservas vencidas a tiempo. La demo local revisa vencimientos al utilizar su base.

## Verificación y publicación segura

GitHub Actions ejecuta instalación, revisión de archivos sensibles, lint, tipos, pruebas unitarias, pruebas SQL secuenciales y compilación. No contiene un paso de despliegue. Su resultado debe revisarse: subir código no equivale a tener una compilación aprobada.

Quedan excluidos de Git `.env*` salvo `.env.example`, `.workbuddy-ai/`, `outputs/`, bases SQLite, sesiones de navegador, registros y archivos de build. El manual público se entrega también en `docs/manual-cliente.pdf` cuando esté generado.
