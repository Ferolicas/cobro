# Project Map — Cobro CRM

Actualizado: 2026-09-04

## Producto

Sistema privado de gestión de micropréstamos para un maestro y hasta 500 cobradores, dimensionado para 2.000 clientes iniciales. Los clientes no tienen cuenta. La interfaz prioriza lectura grande, acciones visibles, lenguaje directo y uso cómodo desde móvil.

## Stack y producción

- Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4.
- Servidor Node propio (`server.ts`) con Next y Socket.IO 4.
- Better Auth con credenciales, cambio obligatorio y recuperación por correo mediante SMTP2GO.
- Rate limiting persistente en PostgreSQL: 8 intentos de acceso por minuto y 3 solicitudes de recuperación cada 15 minutos por IP.
- PostgreSQL nativo + Prisma 7.
- Sanity Assets para fotos/videos; PostgreSQL conserva metadatos y relaciones.
- Frankfurter v2 para conversión diaria PEN → COP con caché local.
- VPS normal: `/var/www/cobro`, PM2 `cobro`, puerto 4009, Caddy y `cobro.olcas.app`.
- Integraciones activas verificadas en producción: Sanity `qxetuirc`/`production`, SMTP2GO y DNS/SSL público.

## Viajes principales

1. Maestro o cobrador inicia sesión con correo y contraseña.
2. Una cuenta nueva/restablecida cambia obligatoriamente `cobro1234*`.
3. El maestro supervisa toda la empresa en modo de lectura operativa; mantiene únicamente acciones administrativas como cobradores, zonas, auditoría y pérdidas.
4. El cobrador ve únicamente su ruta y es el único rol que crea clientes, desembolsa, renueva, registra pagos, sube documentos y confirma el cierre diario.
5. Un crédito nace con capital, 20% de interés, 24 cuotas y primera cuota retenida.
6. Los pagos se reparten FIFO: un pago parcial deja el remanente pendiente; al día siguiente se suma a lo vencido, sin penalidad.
7. La renovación paga el saldo anterior desde el capital nuevo, descuenta la primera cuota y el microseguro opcional, y abre una deuda calculada sobre el capital nuevo completo.
8. La liquidación se arma desde los movimientos del día; el cobrador solo declara base inicial, gastos, retiro y caja física contada antes de confirmar. El cuadro expone BASE, SALIÓ, COBRO, YAPES, PRESTÓ, M.S, GASTOS, COBRADOR, ENTREGA, CAJA y diferencia.
9. Cada cobrador tiene un control financiero completo accesible desde su tarjeta: seis días, balance semanal, clientes nuevos diarios y cadena de 11 semanas.
10. Cada acción genera auditoría, actividad y/o notificación persistida; Socket.IO invalida las vistas en tiempo real.
11. Al pulsar una notificación, el maestro ve un modal con mensaje, actor, hora, todos los detalles y enlace al registro relacionado.

## Módulos de interfaz

- `src/components/crm/CrmShell.tsx`: navegación, cambio PEN/COP, tiempo real, notificaciones y modal exacto.
- `views/DashboardView.tsx`: panorama, caja, cartera y urgencias.
- `views/TodayView.tsx`: ruta diaria y registro rápido de pagos, exclusivo del cobrador.
- `views/ClientsView.tsx`: alta y documentos para el cobrador; consulta global para el maestro.
- `views/CreditsView.tsx`: operación completa para el cobrador; cronograma y movimientos en solo lectura para el maestro.
- `views/LiquidationsView.tsx`: cuadre diario íntegro, M.S, semana de lunes a sábado, ganancia, clientes nuevos, cadena de 11 semanas y cierres.
- `views/CollectorsView.tsx`: altas, activación, restauración de contraseña y acceso al control financiero completo de cada cobrador.
- `views/ReportsView.tsx`, `views/AuditView.tsx`: rentabilidad, pérdidas y trazabilidad.

## Backend

- `src/app/api/auth/[...all]`: Better Auth.
- `api/clients`, `api/credits`, `api/collectors`: CRUD con alcance por rol.
- `api/credits/[id]/payments`, `renew`: operaciones financieras.
- `api/liquidations`: resumen diario automático, conciliación del cobrador e historial de cierres.
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
- Caja esperada del cobrador = base + pagos en efectivo − efectivo neto entregado − gastos − retiro. Yape y transferencias se informan, pero no aumentan la caja física.
- Los campos derivados de liquidación se recalculan en el servidor desde `CashMovement`; el cliente no puede enviarlos ni alterarlos.
- En el formato tipo Excel, COBRO incluye efectivo cobrado más primera cuota, M.S y saldo de renovación retenidos; así el cuadre usa el capital bruto PRESTÓ sin duplicar caja. Yape/transferencia permanece separado.
- Balance semanal: 3% informativo del cobro, interés proyectado del 20%, M.S real, gastos, retiro, ganancia compatible con el Excel y resultado neto ampliado.
- Pérdida = saldo castigado; no se confunde con interés que dejó de ganarse.
- Estados principales: `ACTIVE`, `OVERDUE`, `PAID`, `RENEWED`, `WRITTEN_OFF`.

## Importación histórica

`scripts/import-excel.ts` importa una vez `COBRO BEATRIS UNIDO 02 SEPTIEMBRE2026.xlsx`, conserva pagos explícitos, microseguro diario, dos cierres fechados, notas/comentarios, balance semanal, clientes nuevos, registro adicional sin fecha y cadena de 11 semanas. Los movimientos históricos se fijan al mediodía UTC para conservar el día de negocio peruano escrito en el archivo. El Excel no identifica por separado la primera cuota histórica, así que no se inventa; la regla automática sí aplica a créditos nuevos.

## Operación segura

- `.env` solo en local/VPS, permisos 600.
- Las contraseñas se almacenan con el hash de Better Auth; el maestro nunca ve contraseñas existentes.
- El proxy de documentos valida sesión y pertenencia antes de descargar.
- Los eventos WebSocket no son fuente de verdad: la UI vuelve a consultar el dato persistido.
- Las notificaciones de documentos fueron verificadas de extremo a extremo: carga a Sanity, evento WebSocket sin recarga y modal detallado clicable.
- Antes de cada despliegue: `pnpm typecheck && pnpm lint && pnpm build`.
