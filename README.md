# Symphony

Orquestación jerárquica de agentes de código. Un **director** releva con vos y decide; **atriles** planifican y dividen; **tutti** ejecutan tareas chicas con los modelos más baratos que alcancen. Cada agente es un **nodo** con identidad fija, estado en disco (su *partichela*) y un worktree de git propio. Nada vive en el contexto del chat: si un nodo pierde el hilo, se relanza desde sus archivos y sigue.

Funciona con Claude Code, Codex CLI y OpenCode (y cualquier runner que lea `AGENTS.md`), mezclados en la misma obra: un Opus de director, un Sonnet de atril, un Qwen local de tutti.

## Instalación

```
npx skills add <usuario>/symphony -g          # los skills, para todos los runners
npm install -g github:<usuario>/symphony       # el comando `sym`
sym doctor                                     # qué falta
```

Opcional: `npx skills add tt-a1i/archify -g` para el diagrama en vivo.

## En dos minutos

```
sym init mi-feature --repos api=~/code/api,web=~/code/web
sym launch D --exec            # el director releva con vos y arma la partitura
sym launch A1 --exec           # cada atril divide y lanza sus tutti
sym status                     # el árbol, y quién espera una decisión tuya
sym clean --all                # curtain-call
```

Para la introducción completa, pedile a cualquier agente con los skills instalados el `preludio`.

## Estructura del repo

```
skills/        un SKILL.md por fase: symphony (constitución), preludio, relevamiento, partitura,
               partichela, arreglo, lirico, ensayo, critica, afinacion, ensamble, curtain-call
bin/sym.js     operaciones mecánicas: init, node create, launch, event, check, merge, blame, status, clean, doctor
templates/     partichela.md, symphony.yaml, TESTING.md, identidad (CLAUDE.md / AGENTS.md)
runners/       notas y hooks opcionales por runner
examples/      una obra mínima recorrida paso a paso
```

## Principios

- **El estado vive en disco.** `repertorio/<obra>/` tiene todo; el chat no tiene nada.
- **Hacia abajo, un nivel.** Un nodo solo crea hijos. Nunca hermanos, nunca padres.
- **Ejecutar no es dividir.** El que descubre algo lo reporta; el padre decide.
- **Criterios, no opiniones.** Aceptar es correr comandos que salen en 0.
- **Lo mecánico lo hace `sym`.** IDs, ramas, worktrees, estados, límites.
- **Subir de modelo es relanzar.** Mismo nodo, mismo estado, modelo más capaz, con datos que lo justifiquen.

La constitución completa está en [`skills/symphony/SKILL.md`](skills/symphony/SKILL.md).
