# Matriz de tiempo real

La base de datos es la fuente de verdad. Cada mutación confirma primero PostgreSQL y después publica `data:changed`; el navegador invalida la vista activa y vuelve a consultar sus endpoints autorizados. Ningún evento transporta datos financieros ni personales.

## Evento × pantallas afectadas

| Cambio persistido | Emisor | Vistas que se resincronizan sin F5 |
| --- | --- | --- |
| Cliente creado | `POST /api/clients` | Resumen, clientes, cobradores, liquidaciones, auditoría y notificaciones |
| Cliente, asignación o GPS actualizado | `PATCH /api/clients/[id]` | Lista y ficha de cliente abierta, ficha de crédito, ruta, auditoría y notificaciones |
| Cliente eliminado | `DELETE /api/clients/[id]` | Resumen, clientes, créditos, ruta, cobradores, liquidaciones, reportes y auditoría |
| Documento o justificante cargado | `POST /api/uploads` | Ficha de cliente o crédito abierta, pagos y notificaciones |
| Crédito creado | `POST /api/credits` | Resumen, clientes, créditos, ruta, liquidaciones, cobradores, reportes, auditoría y notificaciones |
| Pago registrado | `POST /api/credits/[id]/payments` | Resumen, cliente/crédito abierto, ruta, liquidaciones, cobradores, reportes, auditoría y notificaciones |
| Visita sin pago | `POST /api/credits/[id]/no-payment` | Ruta, ficha de crédito abierta, actividad, auditoría y notificaciones |
| Crédito renovado | `POST /api/credits/[id]/renew` | Resumen, clientes, créditos, ruta, liquidaciones, cobradores, reportes, auditoría y notificaciones |
| Crédito castigado | `PATCH /api/credits/[id]` | Resumen, clientes, créditos, ruta, liquidaciones, cobradores, reportes, auditoría y notificaciones |
| Jornada liquidada | `POST /api/liquidations` | Resumen, liquidaciones, cobradores, reportes, auditoría y notificaciones |
| Cobrador creado, editado o clave restablecida | `/api/collectors/**` | Resumen administrativo, cobradores, selectores de liquidación, auditoría y notificaciones |
| Zona creada | `POST /api/zones` | Cobradores y formularios abiertos de alta de cliente de todas las sesiones |
| Notificación leída | `/api/notifications/**` | Campana y bandeja de todas las pestañas del destinatario |

## Audiencias y aislamiento

- Las operaciones de ruta llegan a todos los maestros y a todas las pestañas del cobrador actor/asignado.
- Las acciones administrativas llegan a los maestros y al cobrador afectado.
- Los cambios de zonas, que sí son compartidos, llegan a todas las sesiones autenticadas.
- Después del aviso, cada navegador vuelve a consultar con su sesión; el servidor mantiene el alcance de cartera por cobrador.

## Recuperación y formularios

- Socket.IO conserva recuperación breve de conexión y reintenta con espera progresiva.
- Si el ticket de cinco minutos caducó durante una caída, el cliente solicita uno nuevo antes de reconectar.
- Cada conexión recuperada fuerza una resincronización desde PostgreSQL.
- No existe polling periódico: Socket.IO reconecta con espera progresiva y renueva el ticket si el servidor rechaza uno caducado.
- Las actualizaciones recibidas mientras hay un formulario abierto se aplican en segundo plano y nunca desmontan ni sobrescriben el borrador del usuario.
- El indicador superior diferencia `En vivo`, `Conectando…` y `Reconectando…`.
- Las ráfagas de eventos se agrupan durante 80 ms para evitar consultas duplicadas durante altas con documentos y crédito.

## Aceptación en producción

La verificación final se hace con dos contextos de navegador autenticados (maestro y cobrador): mantener abierta una ficha de cliente/crédito en A, ejecutar cada mutación aplicable en B y comprobar que lista, detalle, métricas, auditoría y notificación cambian sin recargar. También se reinicia el proceso durante una sesión para comprobar ticket nuevo y resincronización posterior.
