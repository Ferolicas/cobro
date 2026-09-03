# Backlog de salida a producción

Actualizado: 2026-09-04

## P0 — bloquea la entrega pública

- [x] Crear/corregir en Cloudflare el registro A `cobro` → `87.106.236.248` en modo DNS only.
- [x] Configurar Sanity aislado (`qxetuirc` / `production`) y probar carga y borrado real de archivos.
- [x] Configurar SMTP2GO y probar en producción el envío del enlace de recuperación.
- [ ] Sustituir `beatriz@cobro.olcas.app` por el correo real del primer cobrador si es diferente.
- [x] Ejecutar QA visual y funcional en HTTPS real: maestro, cobrador, notificación clicable/modal, carga documental y WebSocket.
- [x] Añadir rate limiting persistente en PostgreSQL a login y recuperación.

## P1 — primera semana

- [ ] Acordar y documentar retención de datos y borrado/anonimización de clientes conforme a la jurisdicción del negocio.
- [ ] Probar una restauración de la base desde backup y confirmar una retención mínima de 14 días.
- [ ] Configurar monitor externo de uptime para `/api/health`.
- [ ] Confirmar nombres definitivos, logotipo y correos de todos los cobradores iniciales.
- [ ] Añadir exportación administrativa CSV/XLSX de cartera, caja y liquidaciones si el cliente la necesita.

## P2 — evolución

- [ ] Adaptador compartido de Socket.IO si en el futuro se escala PM2 a varias instancias.
- [ ] Reglas de riesgo configurables y alertas predictivas de renovación/morosidad.
- [ ] Políticas configurables de retención automática de archivos en Sanity.
