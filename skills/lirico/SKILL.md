---
name: lirico
description: Cambiar el modo operativo de un nodo Symphony (plan, execute, review, integrate, done) sin cambiar su identidad ni su posición, y cargar el skill que corresponde al nuevo modo. Usar cuando un atril decide hacer una tarea él mismo, cuando llega un hijo en done, cuando todos los hijos están aceptados, o cuando un nodo terminó. Requiere el skill symphony.
---

# Lírico

El modo dice qué skill estás ejecutando ahora. Cambiarlo es barato y conserva tu contexto; por eso existe en vez de crear un nodo nuevo.

## Transiciones permitidas

| De | A | Condición | Skill que cargás |
|---|---|---|---|
| `plan` | `execute` | No tenés hijos, o todos están `merged`. Vas a hacer el trabajo vos mismo dentro de tu territorio. | `ensayo` |
| `plan` | `review` | Un hijo marcó `done`. | `critica`, `afinacion` |
| `review` | `plan` | Rechazaste o aceptaste y quedan hijos activos. | `arreglo` (si hay que replanificar) |
| `review` | `integrate` | Todos los hijos están `accepted`. | `ensamble` |
| `execute` | `integrate` | Terminaste tu trabajo propio y además tenés hijos `accepted`. | `ensamble` |
| `execute` | `done` | Terminaste, `sym check` pasa, no tenés hijos. | — |
| `integrate` | `done` | Mergeaste todo y tus criterios pasan. | — |

Cualquier otra transición no existe. En particular: `execute` nunca va a `plan` (regla 2: ejecutar no es dividir; si descubriste que hay que dividir, `blocked` y que decida tu padre).

## Cómo

1. Verificá la condición. Si no se cumple, no cambies de modo.
2. Editá `mode:` en tu frontmatter.
3. Escribí en la bitácora: `lirico: <de> → <a>, porque <condición>`.
4. Reescribí "Estado actual" para el nuevo modo.
5. `sym event <ID> checkpoint -m "lirico <de>→<a>"`.
6. Cargá el skill del nuevo modo y seguí.

El director usa `lirico` igual que cualquier nodo, pero nunca entra en `execute` (regla 4).
