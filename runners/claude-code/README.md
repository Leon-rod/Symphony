# Claude Code

`sym launch` arma el comando con el template de `runners.claude-code` en `symphony.yaml`. El default es `claude --model {model} "{prompt}"`; ajustalo a los flags de tu versión (`claude --help`).

`settings.json` tiene hooks opcionales que reinyectan la partichela cuando Claude Code retoma después de compactar contexto. Copiá el bloque `hooks` a `~/.claude/settings.json` o al `.claude/settings.json` del worktree. Verificá los nombres de los hooks contra la documentación de tu versión de Claude Code: cambian.
