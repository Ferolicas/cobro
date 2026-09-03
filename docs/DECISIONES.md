# Decisiones de producto y operación

Actualizado: 2026-09-04

## Producto y usuarios

- Es un CRM privado para una empresa independiente de micropréstamos informales.
- Interactúan un usuario maestro y cobradores; los clientes nunca inician sesión.
- La funcionalidad central es mantener en tiempo real cartera, cuotas, cobros, renovaciones, caja, liquidaciones, ganancias y pérdidas.
- La v1 no tiene registro público, landing, e-commerce, suscripciones ni acceso para prestatarios.
- Referencias: lógica operativa de Freddy/CNP y Freddy/Total (Seguimiento/Diagnóstico), UI de CNP y lenguaje visual de Luft.

## UX, UI y marca

- Nombre operativo actual: Cobro.
- Idioma: español.
- Panel del cobrador mobile-first; panel maestro adaptable y optimizado para escritorio/tablet.
- Lectura cómoda para una persona mayor: tipografía amplia, controles grandes, palabras directas, estados visibles y confirmaciones claras.
- Estética moderna azul/cian, tarjetas luminosas, contraste alto y jerarquía visual elegante.

## Modelo comercial

- Herramienta interna del cliente; no requiere Stripe, planes, checkout, facturación SaaS ni SEO comercial.

## Datos

- PostgreSQL es la fuente de verdad para usuarios, clientes, créditos, pagos, cuotas, caja, liquidaciones, auditoría y notificaciones.
- Sanity solo almacena fotos/videos; las relaciones y permisos viven en PostgreSQL.
- Se tratan datos personales, ubicación, información del negocio, historial financiero y comprobantes.
- No se usan cookies de marketing ni analytics en la v1.
- Pendiente con el cliente: plazo formal de retención y proceso de supresión/anonimización.

## Seguridad

- Acceso cerrado por correo y contraseña; no existe autorregistro.
- Clave temporal fija `cobro1234*`, almacenada únicamente como hash, con cambio obligatorio y sesiones revocables.
- El maestro puede restablecer cobradores; el usuario puede recuperar por enlace de correo enviado con SMTP2GO.
- Autorización por rol y pertenencia en servidor; auditoría de acciones financieras.
- WebSocket usa tickets firmados de cinco minutos y los eventos nunca sustituyen el dato persistido.
- El VPS ya realiza `pg_dumpall` diario; queda pendiente una restauración de ensayo documentada y ampliar/confirmar retención a 14 días.

## Operación

- Producción: VPS normal, PM2 `cobro`, puerto 4009, Caddy, PostgreSQL nativo.
- CI/CD: cada push a `main` despliega con migraciones, seed idempotente, build, recarga y healthcheck.
- Tipo de cambio: Frankfurter v2, PEN→COP, con caché diaria en PostgreSQL.
- Email transaccional: SMTP2GO con remitente autorizado de `olcas.app`.
- Sin SEO, sitemap, captación, HubSpot ni analytics por ser un sistema privado con `noindex`.
