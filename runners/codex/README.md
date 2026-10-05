# Codex CLI

Symphony funciona con Codex como runner de cualquier nodo. Lo que hay que saber:

## Skills

Codex lee skills de `$CODEX_HOME/skills` (por defecto `~/.codex/skills`) y de `.agents/skills`. `npx skills add Leon-rod/Symphony -g` los deja en `~/.agents/skills` y los enlaza a Codex, así que no hace falta nada más. Si preferís el instalador propio de Codex: `$skill-installer install https://github.com/Leon-rod/Symphony/tree/master/skills/symphony` (y así con cada skill). Los skills se invocan implícitamente por su `description`, o a mano con `$symphony`, `$arreglo`, etc.

## Identidad

Codex lee `AGENTS.md` desde el cwd hacia arriba. `sym` deja uno en la raíz de cada worktree con la identidad del nodo, así que un `codex` abierto ahí ya sabe quién es.

## Sandbox: el único cambio obligatorio

El sandbox por defecto de Codex (`workspace-write`) solo permite escribir en el cwd y deja los directorios `.git` en solo lectura. Symphony necesita dos cosas que eso bloquea: escribir en `repertorio/<obra>/` (partichelas, eventos, inbox) y commitear en un worktree, cuyo `.git` real vive en el repo principal. Un nodo Codex con el sandbox por defecto falla en el primer `sym event`.

Dos opciones:

1. **Sin sandbox** (la que trae el template): `codex --model {model} -s danger-full-access {prompt}`. El aislamiento de Symphony no depende del sandbox: cada nodo trabaja en su worktree, `sym check` rechaza cambios fuera del territorio, y nadie mergea nada sin pasar por `critica`. Si querés cero preguntas en los tutti baratos, agregá `-a never`; si preferís que pida permiso ante comandos raros, dejá el `-a on-request` por defecto.
2. **Con sandbox, ampliado**: `codex --model {model} -s workspace-write --add-dir {obra_dir} --add-dir {repo_dir} -c 'sandbox_workspace_write.allow_limited_git_writes=true' {prompt}`. Requiere una versión de Codex reciente (`allow_limited_git_writes` es de 2026) y hay que verificar en tu versión que los commits desde un worktree lleguen al `.git` del repo principal. Si el primer `git commit` del tutti falla con `index.lock: Operation not permitted`, volvé a la opción 1.

## Modelos

En `symphony.yaml`, cada nivel de `tiers` puede usar `runner: codex` con el modelo que quieras. Los nombres válidos los lista `/model` dentro de Codex. Un ejemplo para una máquina solo con Codex y un modelo local:

```yaml
tiers:
  - { id: 0, runner: opencode, model: ollama/qwen3.6:27b, label: local }
  - { id: 1, runner: codex, model: <modelo-mini-de-codex>, label: liviano }
  - { id: 2, runner: codex, model: <modelo-estándar-de-codex>, label: medio }
  - { id: 3, runner: codex, model: <modelo-grande-de-codex>, label: alto }
```

## LSP (Serena) solo donde sirve

Un servidor de lenguaje le da al agente "ir a definición", "referencias" y "símbolos de un archivo" con rangos exactos: es lo que los atriles necesitan para escribir **Ubicaciones** sin `grep` ni `cat`. Serena (`github.com/oraios/serena`) lo expone por MCP y corre con Codex; para Angular cubre el lado `.ts`, no los templates.

Habilitalo una vez en `~/.codex/config.toml`:

```toml
[mcp_servers.serena]
command = "uvx"
args = ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server", "--context", "codex"]
```

Y dejá que `launch_extra` de `symphony.yaml` lo apague en los tipos que no exploran (`mecanica`, `local`): cada servidor MCP mete el esquema de todas sus herramientas en el contexto de cada turno, y un tutti mecánico no debe pagarlo. Verificá en tu versión que la clave sea `enabled`; si Codex la rechaza, usá un perfil (`--profile`) con y otro sin Serena.

## `sym wait` y el límite de tiempo por comando

`sym wait` bloquea hasta `wait_timeout` segundos (100 por defecto). Si Codex corta el comando antes, el nodo ve un error en vez de "sin novedades". Probá una vez `sym wait D --timeout 60` desde un nodo Codex: si lo corta, bajá `wait_timeout` en `symphony.yaml` hasta un valor que aguante.

## Compactación

Codex no tiene hooks para reinyectar la partichela. La regla 11 del skill `symphony` (releer la partichela al empezar cada turno) es el único contrato, y es suficiente: si un nodo se pierde, `sym launch <ID>` lo relanza desde disco.
