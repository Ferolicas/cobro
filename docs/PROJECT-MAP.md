# Project Map — Cobro CRM

Actualizado: 2026-09-14 · Commit base: 1a0d215

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

1. Administrador o cobrador inicia sesión con correo y contraseña. Desde Usuarios, el administrador principal puede crear administradores con uno o varios cobradores asignados, modificar esas asignaciones en cualquier momento, o crear un cobrador y transferirle la cartera activa de un acceso anterior en la misma operación.
2. Una cuenta nueva/restablecida entra con `cobro1234*` y, en el primer acceso, solo escribe y confirma su contraseña nueva; ambos campos permiten mostrar u ocultar el texto. La sesión autenticada y `mustChangePassword` protegen este flujo de un segundo uso.
3. El administrador principal supervisa toda la empresa; cada administrador secundario ve solamente sus cobradores asignados. Desde Usuarios puede abrir el panel, clientes, créditos y liquidación de cada uno, además de filtrar cobradores por zona y clientes por cobrador.
4. El cobrador ve únicamente su ruta y es el único rol que crea clientes, desembolsa, renueva, registra pagos/no pagos, sube documentos y confirma el cierre diario. Sus administradores asignados ven estas acciones, ubicaciones y evidencias en tiempo real, sin ejecutar operaciones de ruta.
5. El alta guiada del cliente pasa por datos y zona, DNI/fotos/vídeo/ubicación GPS actual y crédito inicial. La ubicación conserva coordenadas, precisión y fecha de captura.
6. Un crédito nace con capital, 20% de interés, 24 cuotas y un pago inicial que cubre como mínimo la primera cuota; `/api/credits/preview` calcula el contrato y efectivo antes de confirmar. En “Nuevo crédito”, elegir un cliente con crédito activo cambia directamente al formulario de renovación de su crédito vigente.
7. Los pagos se reparten FIFO: un pago parcial deja el remanente pendiente. Yape/transferencia requiere uno o más justificantes pre-subidos y ligados transaccionalmente al pago; efectivo no los acepta. Cada cobro muestra cuota actual, total y cuotas pagadas.
8. “No pagó” crea una actividad diaria idempotente, auditoría y notificación sin alterar deuda ni caja.
9. La renovación paga el saldo anterior desde el capital nuevo, descuenta el pago inicial y el microseguro opcional, y abre una deuda calculada sobre el capital nuevo completo. También se lanza desde la ficha del cliente.
10. La liquidación toma movimientos del día; el cobrador solo declara gastos manuales, caja real y notas. BASE comienza en S/30.000 y SALIDA muestra esa base menos los préstamos brutos registrados durante la jornada; el sueldo del 3% se carga el sábado y la cadena automática del miércoles no supera el sobrante.
11. Un saldo operativo negativo se expone al cobrador y al maestro como apoyo requerido de otro cobrador. No se crea una transferencia ficticia.
12. Cada cobrador tiene control de seis días, cierre diario visible, M.S, sueldo, gastos, clientes nuevos y resultado neto de 11 semanas.
13. Cada acción genera auditoría, actividad y/o notificación persistida; Socket.IO invalida tanto al maestro como al cobrador actor.
14. Al pulsar una notificación, el maestro ve mensaje, actor, hora, detalles y enlace al cliente, crédito o liquidación.

## Módulos de interfaz

- `src/components/crm/CrmShell.tsx`: navegación, cambio PEN/COP, tiempo real, notificaciones y modal exacto.
- `views/DashboardView.tsx`: panorama, caja, cartera y urgencias.
- `views/TodayView.tsx`: ruta diaria, cuota actual, pago con prueba digital y “No pagó”, exclusivo del cobrador.
- `views/ClientsView.tsx`: alta guiada en tres pasos, GPS/documentos/crédito y renovación para el cobrador; consulta completa, filtro por cobrador y eliminación administrativa confirmada por código para el maestro. La eliminación definitiva se bloquea si existen movimientos ligados a un cierre diario.
- `views/CreditsView.tsx`: vista previa financiera, actualización documental, pago, renovación, pruebas y visitas sin pago; el selector deriva créditos activos a renovación y el plan funciona como historial diario: importe real, faltante acumulado, amarillo persistente y check de abono; solo lectura operativa para el maestro.
- `views/LiquidationsView.tsx`: BASE inicial, SALIDA disponible después de préstamos, M.S, sueldo 3%, cadena, sobrante, déficit, semana y cierres diarios.
- `views/CollectorsView.tsx`: alta de administradores con selección múltiple de cobradores, edición inmediata de asignaciones, zonas como filtros, base/caja/déficit y accesos directos al panel, clientes, créditos y control financiero de cada cobrador visible.
- `views/ReportsView.tsx`, `views/AuditView.tsx`: rentabilidad, pérdidas y trazabilidad.

## Backend

- `src/app/api/auth/[...all]`: Better Auth.
- `api/clients`, `api/credits`, `api/collectors`: CRUD con alcance por rol y por `CollectorAssignment`. El administrador principal crea usuarios; una cuenta `MASTER` secundaria exige uno o varios cobradores y queda limitada en servidor a esas carteras. `PATCH /api/administrators/[id]/collectors` reemplaza la asignación de forma transaccional y auditada. Para cuentas `COLLECTOR`, la creación acepta opcionalmente un cobrador anterior y transfiere clientes activos y créditos abiertos, desactiva su acceso y revoca sus sesiones dentro de una sola transacción. `DELETE /api/clients/[id]` purga transaccionalmente un expediente autorizado todavía no cerrado, conserva una auditoría mínima y elimina sus binarios de Sanity; si la limpieza externa falla deja el identificador técnico pendiente en `SystemSetting`.
- `api/credits/[id]/payments`, `renew`: operaciones financieras.
- `api/credits/preview`: cálculo financiero autoritativo antes del desembolso o renovación.
- `api/credits/[id]/no-payment`: registra una visita diaria sin movimiento financiero.
- `api/liquidations`: resumen diario automático, conciliación del cobrador e historial de cierres.
- `api/uploads`, `api/documents/[id]`: subida múltiple a Sanity y descarga autorizada.
- `api/notifications`: bandeja, lectura individual y masiva.
- `api/realtime-ticket`: JWT de cinco minutos para Socket.IO.
- `api/exchange`: tipo de cambio cacheado.
- `api/audit`, `api/health`: auditoría y salud operativa.

## Datos y reglas

- Fechas de cuota: 24 días efectivos de cobro de lunes a sábado; los domingos nunca generan cuota ni cuentan para vencimiento.
- La suma de las 24 cuotas es exactamente capital + 20%; los céntimos residuales se distribuyen en las primeras cuotas.
- Cada casilla del plan se reconstruye exclusivamente desde registros `Payment` inmutables, en orden cronológico, y conserva exactamente el importe de esa cuota registrada; nunca usa el total FIFO mutable de la cuota ni agrupa varios registros hechos el mismo día. Un pago parcial o cero queda amarillo para siempre; si hubo abono conserva check verde y el faltante se suma visualmente al importe exigible del siguiente registro. Los pagos históricos ya asignados se conservan aunque su fecha haya quedado fuera del calendario recalculado sin domingos. Tres días con cuotas vencidas pendientes cambian la clasificación de B a Q.
- Saldo = total contractual − pagos aplicados. No hay intereses de mora ni multas.
- Caja neta de desembolso = capital − pago inicial − microseguro − liquidación anterior. El pago inicial nunca es menor que la primera cuota contractual.
- Caja esperada = BASE + TOTAL INGRESADO − PRÉSTAMOS − GASTOS MANUALES − SUELDO − RETIRO CADENA. Yape/transferencias se informan, pero no aumentan caja física.
- TOTAL INGRESADO = COBRADO + M.S. COBRADO incluye efectivo, primera cuota y saldo anterior retenido en una renovación, pero excluye el microseguro para que este se vea y se sume exactamente una vez.
- BASE es el capital inicial de S/30.000 por cobrador. SALIDA = BASE − PRÉSTAMOS brutos del día; la caja esperada incorpora además cobros, M.S y gastos, y puede ser negativa para mostrar el apoyo necesario.
- Los campos derivados de liquidación se recalculan en el servidor desde `CashMovement`; el cliente no puede enviarlos ni alterarlos.
- Los movimientos de originación nuevos se fijan al mediodía UTC para conservar el día contractual en Perú. La lectura financiera reconoce además los originados históricamente a medianoche UTC, por lo que desembolsos, primeras cuotas, microseguros y liquidaciones de renovación existentes aparecen en su jornada correcta sin migrar datos.
- En el formato tipo Excel, PRÉSTAMOS usa el capital bruto. La primera cuota y el saldo de renovación retenido forman parte de COBRADO; M.S permanece separado y ambos forman TOTAL INGRESADO. Yape/transferencia permanece separado de la caja física.
- Balance semanal: sueldo = 3% de COBRADO sin M.S; gasto total = manual + sueldo + cadena; resultado neto = COBRADO − PRÉSTAMOS − gasto total + M.S. El panel muestra también los resultados intermedios antes de gastos y antes de M.S.
- Cadena: retiro automático el miércoles limitado al sobrante sobre S/30.000; sus semanas dinámicas usan la misma fórmula neta del balance semanal y los valores históricos importados permanecen intactos.
- Pérdida = saldo castigado; no se confunde con interés que dejó de ganarse.
- Estados principales: `ACTIVE`, `OVERDUE`, `PAID`, `RENEWED`, `WRITTEN_OFF`.

## Importación histórica

`scripts/import-excel.ts` importa una vez `COBRO BEATRIS UNIDO 02 SEPTIEMBRE2026.xlsx`, conserva pagos explícitos, microseguro diario, dos cierres fechados, notas/comentarios, balance semanal, clientes nuevos, registro adicional sin fecha y cadena de 11 semanas. Los movimientos históricos se fijan al mediodía UTC para conservar el día de negocio peruano escrito en el archivo. El Excel no identifica por separado la primera cuota histórica, así que no se inventa; la regla automática sí aplica a créditos nuevos.

## Operación segura

- `.env` solo en local/VPS, permisos 600.
- Las contraseñas se almacenan con el hash de Better Auth; el maestro nunca ve contraseñas existentes.
- `User.isSuperAdmin` distingue al administrador principal. `CollectorAssignment` delimita los cobradores visibles de cada administrador secundario; dashboard, clientes, créditos, documentos, liquidaciones, auditoría, notificaciones y eventos en vivo vuelven a validar ese alcance en el servidor.
- Desactivar un cobrador revoca inmediatamente todas sus sesiones. Un intento de acceso con credenciales válidas permanece en el login y muestra `Usuario desactivado`; las rutas y APIs rechazan además cualquier sesión inactiva residual.
- Una transferencia de cartera cambia únicamente la asignación operativa de clientes activos y créditos `ACTIVE/OVERDUE`. Pagos, cierres, caja, documentos, actividades y auditorías anteriores permanecen ligados al cobrador que los ejecutó; el cobrador anterior continúa visible como inactivo.
- El proxy de documentos valida sesión y pertenencia antes de descargar.
- Los eventos WebSocket no son fuente de verdad: la UI vuelve a consultar el dato persistido. Todas las mutaciones visibles publican después de persistir a maestros y al cobrador afectado; las zonas se publican a todas las sesiones. Las fichas de cliente/crédito abiertas también se reconsultan. No hay polling periódico: Socket.IO reconecta y renueva el ticket caducado; la resincronización en vivo ocurre en segundo plano sin desmontar ni sobrescribir formularios abiertos. La matriz completa vive en `docs/REALTIME.md`.
- Los justificantes digitales se suben primero y el servicio financiero verifica propiedad, crédito, categoría y que no hayan sido usados antes de ligarlos al pago dentro de la transacción.
- Las notificaciones de documentos fueron verificadas de extremo a extremo: carga a Sanity, evento WebSocket sin recarga y modal detallado clicable.
- Antes de cada despliegue: `pnpm typecheck && pnpm lint && pnpm build`.
