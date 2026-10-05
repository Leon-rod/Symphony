---
name: preludio
description: "Introducción a Symphony para el desarrollador humano. Usar cuando alguien pregunta qué es Symphony, cómo se usa, qué skills incluye, qué dependencias necesita, o pide un ejemplo para arrancar. También cuando se invoca /preludio. No es para nodos en ejecución: ellos usan el skill symphony."
---

# Preludio

Symphony reparte un desarrollo entre agentes de código organizados como una orquesta: un **director** releva con vos y decide; **atriles** planifican y dividen; **tutti** ejecutan tareas chicas con modelos baratos. Cada agente es un **nodo** con estado en disco y un worktree de git propio, así que podés cerrar un chat, abrir otro, decirle "sos el nodo A1.T2" y sigue donde estaba.

Cuando te pidan esta introducción, mostrá las secciones de abajo adaptadas a lo que el usuario preguntó. No las vuelques enteras si solo preguntó una cosa.

## Qué necesitás

- git ≥ 2.20 (worktrees), Node ≥ 18.
- Al menos un runner: Claude Code, Codex CLI u OpenCode. Para modelos locales, OpenCode con Ollama o similar.
- El skill `archify` (`npx skills add tt-a1i/archify -g`) para el diagrama en vivo. Opcional.
- Wave Terminal, para ver todos los nodos en una pantalla. Opcional.
- `sym doctor` te dice qué falta.

## Instalación

```
npx skills add Leon-rod/Symphony -g          # los skills, para todos los runners
npm install -g github:Leon-rod/Symphony       # el comando sym
```

## Catálogo de skills

| Skill | Quién lo usa | Para qué |
|---|---|---|
| `symphony` | todos los nodos | La constitución: reglas, mapa de archivos, protocolo. |
| `preludio` | vos | Esta introducción. |
| `relevamiento` | director | Discutir con vos qué hay que hacer, sin proponer estructura todavía. Produce `brief.md`. |
| `partitura` | director | Del brief al árbol inicial de atriles, y al diagrama. |
| `partichela` | todos | Leer, escribir y mantener el archivo de estado del nodo. |
| `arreglo` | atriles | Dividir en tareas con territorio, contratos, criterios y nivel de modelo. |
| `lirico` | todos | Cambiar de modo (plan, execute, review, integrate). |
| `ensayo` | nodos en execute | Ejecutar la tarea, autoverificar, reportar. |
| `critica` | padres | Evaluar a un hijo contra sus criterios y clasificar las fallas. |
| `afinacion` | padres | Decidir, con datos, si un hijo necesita un modelo más capaz. |
| `ensamble` | padres | Integrar hijos aceptados y correr los criterios propios. |
| `curtain-call` | director | Cerrar la obra: limpiar worktrees y ramas, archivar. |

## Vocabulario

| Término | Qué es |
|---|---|
| **Repertorio** | Directorio raíz, fuera de los repos, donde viven las obras. |
| **Obra** | Un run completo: un objetivo, su árbol de nodos, ramas y worktrees. |
| **Nodo** | Un agente con ID, partichela y worktrees. |
| **Partichela** | El archivo de estado de un nodo. Su única memoria. |
| **Partitura** | El árbol inicial que arma el director, y el diagrama que lo muestra. |
| **Territorio** | Archivos que un nodo puede tocar. Disjunto entre hermanos. |
| **Ubicaciones** | Rutas y rangos exactos que el padre le deja al hijo para que no explore. |
| **Tipo** | Presupuesto de lectura y loop de un nodo: `mecanica`, `local`, `transversal`, `investigativa`. |
| **Tier** | Nivel de modelo de un nodo. |
| **Lírico** | Cambio de modo de un nodo. |
| **Afinación** | Cambio de tier según rendimiento. |
| **Reparación (R)** | Nodo que el director crea para arreglar una falla de la integración final. |
| **Curtain-call** | Cierre de la obra. |

## El mapa

```
repertorio/<obra>/
  symphony.yaml   brief.md   registry.json   events.jsonl   score.archify.json
  nodes/<ID>/partichela.md
  wt/<ID>/<repo>/
```

Los IDs dicen la posición: `A1` cuelga del director, `A1.T2` es el segundo tutti de `A1`, `D.R1` es un nodo de reparación. Las ramas son `symphony/<obra>/<ID>`.

## Comandos de `sym`

| Comando | Qué hace |
|---|---|
| `sym init <obra> --repos a=/ruta[,b=/ruta]` | Crea la obra, su `symphony.yaml`, el director y sus worktrees. |
| `sym node create <padre> --kind atril\|tutti\|reparacion --tipo ... [--tier N] [--depends ...]` | Crea un hijo: partichela, rama desde el padre, worktrees, identidad. |
| `sym node show <ID>` | Paquete de arranque compacto. `--raw` es el archivo entero. |
| `sym launch <ID> [--exec \| --wave]` | Comando de lanzamiento según tier y tipo. |
| `sym tab <ID>` | Comandos para abrir ese nodo, sus hijos, su tablero y su `conduct` en una pestaña de Wave. |
| `sym event <ID> <tipo> [-m ...]` | Registra un evento y actualiza estado, registro y diagrama. |
| `sym wait <ID>` / `sym tell <ID\|humano> -m ...` | Esperar corto / dejar un mensaje. |
| `sym conduct [--focus ID]` | Proceso sin modelo que relanza nodos dormidos cuando los necesitan. |
| `sym check <ID>` / `sym diff <ID>` | Criterios y patrones prohibidos / diff acotado contra el padre. |
| `sym merge <ID>` / `sym blame <repo>/<ruta>` | Mergear un hijo aceptado / quién es dueño de un archivo. |
| `sym status` / `sym score` / `sym board [--focus ID]` | Árbol / diagrama / tablero en vivo. |
| `sym cost` | Tokens por nodo y por tier, desde los logs de sesión de Codex y Claude Code. |
| `sym clean [--all]` / `sym doctor` | Curtain-call / dependencias. |

## Cómo se gastan los tokens, y cómo lo controla Symphony

Cada turno de un agente re-manda todo su contexto. Symphony ataca eso en cuatro lugares: los nodos **duermen** en vez de esperar (`sleep` + `conduct`), arrancan con un **paquete** de una sola llamada (`sym node show`), reciben **ubicaciones** y un **tipo** que les limita cuánto leen, y usan salidas acotadas (`sym check`, `sym diff`). `sym cost` te dice si funciona.

## Un ejemplo en diez minutos

1. `sym init mi-feature --repos api=~/code/api,web=~/code/web` crea la obra y el director.
2. `sym launch D --exec` abre el director. Charlás con él hasta cerrar el relevamiento (`relevamiento`), él escribe `brief.md` y arma la partitura: por ejemplo `A1 Backend` y `A2 Frontend`.
3. Abrís un bloque por atril: `sym launch A1 --exec`. El atril divide (`arreglo`) en `A1.T1`, `A1.T2`, con tareas chicas y nivel bajo de modelo.
4. Lanzás los tutti (o los lanza el atril con `--wave`). Cada uno trabaja en su worktree, corre `sym check`, marca `done` y se cierra.
5. `sym conduct` relanza al atril, que evalúa (`critica`), rechaza o acepta, sube de nivel si hace falta (`afinacion`), mergea (`ensamble`) y marca `done`.
6. El director integra, corre la suite completa, abre PR a `main`. Vos aprobás el PR.
7. `sym clean --all`: curtain-call.

`sym status` en cualquier momento te muestra el árbol y quién está esperando una decisión tuya. `sym board --wave` abre el mismo árbol como diagrama en vivo en un bloque de Wave; se actualiza solo con cada evento.

## Con Wave

Un workspace por obra; una pestaña por linaje: la del director, y una por atril con sus tutti. `sym tab <ID>` imprime el bloque de comandos de una pestaña (tablero enfocado en ese nodo, su partichela, y el lanzamiento del nodo y sus hijos); lo pegás en un bloque de la pestaña nueva y listo. Cada atril te lo muestra cuando tiene hijos para lanzar. `sym board --wave --focus <ID> --detach` es el tablero de esa pestaña: solo el linaje del nodo, en vivo. Los badges de los bloques te avisan quién terminó o quién te espera, y `sym tell humano` te manda una notificación cuando un nodo necesita una decisión tuya; esos mensajes quedan en `inbox-humano.md`.

## Cómo se hablan los nodos

Un nodo sin nada que hacer se duerme (termina su sesión). `sym conduct --focus <ID>`, un proceso sin modelo que corre en la pestaña de cada linaje, lee los eventos y relanza al nodo que corresponde cuando un hijo termina o se bloquea, cuando lo rechazan o suben de tier, o cuando le llega un mensaje por `sym tell`. Para esperas de segundos existe `sym wait`, una sola vez. Vos no sos el cartero: si un nodo te pide que le lleves algo a otro, decile que use `sym tell`.
