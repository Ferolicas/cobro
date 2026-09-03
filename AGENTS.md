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
- Un crédito nuevo siempre usa 20%, 24 cuotas, cobra la primera al desembolsar y no aplica mora.
- El microseguro es ingreso de caja separado y nunca aumenta la deuda.
- Una renovación liquida y cierra el crédito anterior antes de crear el nuevo.
- Todo cambio financiero debe ser transaccional, auditable y notificar al maestro.
- El cobrador solo accede a su cartera. La autorización siempre se verifica en servidor.
- Las notificaciones se guardan antes de emitir el evento WebSocket y deben conservar `details` completos y `actionUrl`.
- No subir `.env`, secretos, Excel ni datos personales al repositorio.
- El servidor Socket.IO exige una sola instancia PM2 mientras no exista adaptador compartido.
