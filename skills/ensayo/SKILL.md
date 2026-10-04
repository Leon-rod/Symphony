---
name: ensayo
description: "Loop de trabajo de un nodo Symphony en modo execute: hacer la tarea dentro del territorio, autoverificar con sym check, mantener la partichela y reportar done o blocked. Usar cuando un nodo está en modo execute, cuando un tutti arranca o retoma, o cuando un nodo fue relanzado tras un rejected. Requiere el skill symphony."
---

# Ensayo

Tu trabajo es cumplir los criterios de tu partichela, dentro de tu territorio, y nada más.

## Loop

1. Si hay `feedback-<n>.md` para tu iteración actual, leelo primero y escribí en "Estado actual" qué vas a cambiar y qué no.
2. Trabajá en tu worktree (`wt/<ID>/<repo>`). Commiteá seguido, con mensajes que digan qué criterio avanza (`AC-2: validar formato de mail`).
3. Antes de cada commit grande y antes de reportar: `sym check <ID>`. Si falla por territorio, no toques el archivo: es un `blocked`. Si falla por patrón prohibido, corregilo. Si falla por criterio, seguí trabajando.
4. Reescribí "Estado actual" después de cada paso del plan.
5. Cuando `sym check` pasa completo: último commit, "Estado actual" con un resumen de lo hecho, y `sym event <ID> done -m "<una línea>"`. Después, `sym wait <ID>` en loop hasta que tu padre responda. Si vuelve con `accepted`, terminaste. Si vuelve con `rejected`, leé el `feedback-n.md` que te indica y volvé al paso 1. Si vuelve con un mensaje, leelo y seguí según diga. No toques código mientras esperás.

## Blocked

Marcá `blocked` cuando: necesitás tocar algo fuera de tu territorio, un contrato de tu partichela no se puede cumplir como está escrito, un criterio es imposible de satisfacer, o descubriste trabajo que no es tuyo. Antes de hacerlo, escribí en "Estado actual" exactamente qué encontraste, qué opciones ves y cuál recomendás; tu padre decide con eso. `sym event <ID> blocked -m "<una línea>"` y después `sym wait <ID>` en loop. Tu padre va a hacer una de tres cosas, y `sym wait` te lo muestra: cambiarte la partichela y relanzarte (`started`: releé la partichela entera y seguí), mandarte un mensaje con la respuesta, o dejarte en `waiting_human`. No intentes rodear el bloqueo, y no le pidas al humano que le avise a tu padre: tu `blocked` ya le llegó.

## Lo que no hacés

- No corrés la suite completa. Solo tus criterios.
- No escribís tests salvo que tu partichela lo diga (y entonces, con `TESTING.md` y su ejemplo canónico abiertos).
- No tocás `CLAUDE.md`/`AGENTS.md` del worktree ni archivos de otros nodos.
- No "mejorás" cosas fuera del alcance aunque las veas rotas. Anotalas en la bitácora para tu padre.
