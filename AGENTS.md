<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cobro CRM

CRM privado para microcréditos diarios. Producción vive en `cobro.olcas.app`, puerto interno 4009, proceso PM2 `cobro`, PostgreSQL nativo y Caddy en el VPS normal del holding.

## Fuentes de verdad

- `docs/PROJECT-MAP.md`: arquitectura, rutas, dominio y operaciones.
- `prisma/schema.prisma`: modelo de datos.
- `src/lib/loans/service.ts`: reglas financieras. No dupliques estos cálculos en UI.
- PostgreSQL: todos los datos de negocio y metadatos.
- Sanity: únicamente binarios de fotos y videos; nunca decisiones financieras.

## Comandos

- `pnpm dev`: servidor Next + Socket.IO.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: controles obligatorios.
- `pnpm db:migrate`, `pnpm db:seed`: producción.
- `pnpm db:import-excel /ruta/archivo.xlsx`: importación histórica idempotente.

## Reglas críticas

- Todo importe persistido está en céntimos como `BigInt`; las respuestas JSON lo convierten a número.
- Un crédito nuevo siempre usa 20%, 24 cuotas, cobra al desembolsar como mínimo la primera cuota (puede registrar un pago inicial mayor) y no aplica mora.
- El microseguro es ingreso de caja separado y nunca aumenta la deuda.
- Una renovación liquida y cierra el crédito anterior antes de crear el nuevo.
- Todo cambio financiero debe ser transaccional, auditable y notificar al maestro.
- El cobrador solo accede a su cartera. La autorización siempre se verifica en servidor.
- El maestro es supervisor: puede ver toda la información y ejecutar acciones administrativas, pero no puede registrar clientes, desembolsos, renovaciones, pagos, documentos ni cierres diarios.
- Solo el cobrador realiza operaciones de ruta. La liquidación toma cobros, desembolsos, pago inicial, microseguro, renovaciones, sueldo y cadena desde PostgreSQL; el formulario solo declara gastos manuales, caja real y notas.
- La vista financiera conserva el control del Excel con una lectura inequívoca: BASE/SALIDA/COBRADO/M.S/TOTAL INGRESADO/PRÉSTAMOS/GASTOS MANUALES/SUELDO 3%/RETIRO CADENA/SOBRANTE/ENTREGA ESPERADA/CAJA/DIFERENCIA, balance semanal, clientes nuevos y cadena neta de 11 semanas.
- BASE y SALIDA son siempre S/30.000 por cobrador. El sueldo es 3% de lo cobrado sin M.S y se carga el sábado; el miércoles la cadena retira automáticamente como máximo el sobrante sobre la base. Un déficit se muestra como apoyo requerido de otro cobrador, sin inventar transferencias.
- El resultado semanal y cada resultado dinámico de la cadena se calculan como COBRADO − PRÉSTAMOS − GASTOS TOTALES + M.S. El sueldo permanece en 3% de COBRADO y nunca incluye M.S.
- En Nuevo crédito, elegir un cliente con crédito activo abre directamente la renovación de ese crédito. En el plan, una cuota pagada después de su vencimiento se conserva pagada pero se distingue en amarillo.
- El alta de cliente exige zona activa, DNI, ubicación GPS actual, evidencias y crédito inicial. Yape/transferencia exige justificante ligado al pago; sus archivos se numeran de forma persistente.
- Los cierres con `status=LEGACY_IMPORTED` son históricos inmutables del Excel; no se pueden sobrescribir desde el panel del cobrador.
- Las notificaciones se guardan antes de emitir el evento WebSocket y deben conservar `details` completos y `actionUrl`.
- No subir `.env`, secretos, Excel ni datos personales al repositorio.
- El servidor Socket.IO exige una sola instancia PM2 mientras no exista adaptador compartido.
