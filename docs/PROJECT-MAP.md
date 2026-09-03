# Project Map — Cobro CRM

Actualizado: 2026-09-04

## Producto

Sistema privado de gestión de micropréstamos para un maestro y hasta 500 cobradores, dimensionado para 2.000 clientes iniciales. Los clientes no tienen cuenta. La interfaz prioriza lectura grande, acciones visibles, lenguaje directo y uso cómodo desde móvil.

## Stack y producción

- Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4.
- Servidor Node propio (`server.ts`) con Next y Socket.IO 4.
- Better Auth con credenciales, cambio obligatorio y recuperación por correo mediante SMTP2GO.
- PostgreSQL nativo + Prisma 7.
- Sanity Assets para fotos/videos; PostgreSQL conserva metadatos y relaciones.
- Frankfurter v2 para conversión diaria PEN → COP con caché local.
- VPS normal: `/var/www/cobro`, PM2 `cobro`, puerto 4009, Caddy y `cobro.olcas.app`.

## Viajes principales

1. Maestro o cobrador inicia sesión con correo y contraseña.
2. Una cuenta nueva/restablecida cambia obligatoriamente `cobro1234*`.
3. El cobrador ve únicamente su ruta, cartera, clientes, créditos y liquidación.
4. Un crédito nace con capital, 20% de interés, 24 cuotas y primera cuota retenida.
5. Los pagos se reparten FIFO: un pago parcial deja el remanente pendiente; al día siguiente se suma a lo vencido, sin penalidad.
6. La renovación paga el saldo anterior desde el capital nuevo, descuenta la primera cuota y el microseguro opcional, y abre una deuda calculada sobre el capital nuevo completo.
7. Cada acción genera auditoría, actividad y/o notificación persistida; Socket.IO invalida las vistas en tiempo real.
8. Al pulsar una notificación, el maestro ve un modal con mensaje, actor, hora, todos los detalles y enlace al registro relacionado.

## Módulos de interfaz

- `src/components/crm/CrmShell.tsx`: navegación, cambio PEN/COP, tiempo real, notificaciones y modal exacto.
- `views/DashboardView.tsx`: panorama, caja, cartera y urgencias.
- `views/TodayView.tsx`: ruta diaria y registro rápido de pagos.
- `views/ClientsView.tsx`: alta, ficha, documentos y actividad.
- `views/CreditsView.tsx`: alta, cronograma, pagos, renovación y comprobantes.
- `views/LiquidationsView.tsx`: campos diarios de la hoja LIQUIDACION y conciliación.
- `views/CollectorsView.tsx`: altas, activación y restauración de contraseña.
- `views/ReportsView.tsx`, `views/AuditView.tsx`: rentabilidad, pérdidas y trazabilidad.

## Backend

- `src/app/api/auth/[...all]`: Better Auth.
- `api/clients`, `api/credits`, `api/collectors`: CRUD con alcance por rol.
- `api/credits/[id]/payments`, `renew`: operaciones financieras.
- `api/liquidations`: captura diaria y valores sugeridos por sistema.
- `api/uploads`, `api/documents/[id]`: subida múltiple a Sanity y descarga autorizada.
- `api/notifications`: bandeja, lectura individual y masiva.
- `api/realtime-ticket`: JWT de cinco minutos para Socket.IO.
- `api/exchange`: tipo de cambio cacheado.
- `api/audit`, `api/health`: auditoría y salud operativa.

## Datos y reglas

- Fechas de cuota: días 0 a 23 desde el desembolso; vencimiento en el día 24 del ciclo.
- La suma de las 24 cuotas es exactamente capital + 20%; los céntimos residuales se distribuyen en las primeras cuotas.
- Saldo = total contractual − pagos aplicados. No hay intereses de mora ni multas.
- Caja neta de desembolso = capital − primera cuota − microseguro − liquidación anterior.
- Pérdida = saldo castigado; no se confunde con interés que dejó de ganarse.
- Estados principales: `ACTIVE`, `OVERDUE`, `PAID`, `RENEWED`, `WRITTEN_OFF`.

## Importación histórica

`scripts/import-excel.ts` importa una vez `COBRO BEATRIS UNIDO 02 SEPTIEMBRE2026.xlsx`, conserva pagos explícitos y las referencias semanales del BALANCE. El Excel no identifica por separado la primera cuota histórica, así que no se inventa; la regla automática sí aplica a créditos nuevos.

## Operación segura

- `.env` solo en local/VPS, permisos 600.
- Las contraseñas se almacenan con el hash de Better Auth; el maestro nunca ve contraseñas existentes.
- El proxy de documentos valida sesión y pertenencia antes de descargar.
- Los eventos WebSocket no son fuente de verdad: la UI vuelve a consultar el dato persistido.
- Antes de cada despliegue: `pnpm typecheck && pnpm lint && pnpm build`.
