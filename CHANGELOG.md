# Changelog

## 0.4.2 — Windows: el wrapper de Wave va en base64
- Wave vuelve a citar los argumentos de `wsh run --` al estilo POSIX y los ejecuta con `<shell> -c`; en Windows ese shell es pwsh y el script de 0.4.1, con comillas simples adentro, llegaba roto (ningún nodo arrancaba). Ahora en Windows el script viaja con `-EncodedCommand` (base64 UTF-16LE), sin nada que Wave pueda alterar. Linux, Mac y WSL no cambian.

## 0.4.1 — Credencial de Wave en bloques lanzados
- Un bloque abierto con `wsh run` recibe `WAVETERM_SWAPTOKEN` pero no `WAVETERM_JWT` (el canje lo hace la integración de shell, que en un bloque de comando no corre), así que un atril lanzado por `sym` no podía abrir a sus tutti ni poner badges. Ahora `sym launch --wave` y `sym conduct` envuelven el runner para que el bloque canjee el token al arrancar, igual que el bashrc de Wave, y `sym` canjea y cachea el JWT por bloque (`.wave/<blockid>.jwt`) para los bloques que ya estaban abiertos.
- `wsh` se resuelve a ruta absoluta; `sym doctor` muestra el estado de la credencial.

## 0.4.0 — LSP dirigido
- `symphony.yaml`: tabla `launch_extra` por tipo/kind, expandida en el placeholder `{extra}` del runner. Uso: Serena (LSP vía MCP) activo para director, atriles y tutti `transversal`/`investigativa`; apagado para `mecanica`/`local`.
- `runners/codex/README.md`: sección "LSP (Serena) solo donde sirve" con la config de `~/.codex/config.toml`.
- `arreglo`: Ubicaciones salen primero de símbolos/referencias LSP. `ensayo`: una consulta LSP no cuenta como archivo leído.

## 0.3.0 — Economía de tokens
- Dormir en vez de esperar: evento `sleep`, seguimiento de nodos despiertos, `sym conduct [--focus ID]` (proceso sin modelo que relanza nodos).
- `sym node show <ID>`: paquete de arranque compacto (una llamada). Constitución recortada a ~1.850 tokens; referencia movida a `preludio`.
- `tipo` (`mecanica|local|transversal|investigativa`) con presupuesto de lectura; sección **Ubicaciones** obligatoria en tutti.
- `sym diff` acotado; `reasoning` por tier (`{reasoning}`); `sym cost` desde los logs de Codex y Claude Code.

## 0.2.x — Wave y comunicación
- `sym wait`, `sym tell`, `sym tab`, `sym board --focus/--detach`, badges y notificaciones; `wsh` en `~/.waveterm/bin`.
- Launch sin shell (prompt como un solo argumento); fallback cuando no hay TTY.
- `sym score` con dependencias ruteadas por debajo de la fila; Codex con `-s danger-full-access`.

## 0.1.0 — Base
- Constitución, 12 skills, `sym` (init, node, launch, event, check, merge, blame, status, clean, doctor), plantillas, hooks opcionales de Claude Code.
