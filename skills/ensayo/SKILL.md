---
name: ensayo
description: "Loop de trabajo de un nodo Symphony en modo execute: hacer la tarea dentro del territorio y del presupuesto de su tipo, autoverificar con sym check, mantener la partichela, reportar done o blocked y dormirse. Usar cuando un nodo está en modo execute, cuando un tutti arranca o retoma, o cuando fue relanzado tras un rejected. Requiere el skill symphony."
---

# Ensayo

Cumplís los criterios de tu partichela, dentro de tu territorio, con el presupuesto de tu tipo, y nada más.

## Presupuesto por tipo

El paquete de `sym node show` te lo imprime. Es un tope, no una meta:

| tipo | archivos | cómo leés | explorar fuera de Ubicaciones | loop |
|---|---|---|---|---|
| `mecanica` | 2 | solo los rangos de Ubicaciones | no | editar → `sym diff` → `sym check` |
| `local` | 4 | rangos primero; un archivo entero solo si lo vas a editar | no | leer → editar → `sym check` |
| `transversal` | 8 | rangos y `grep` dentro del territorio | sí, dentro del territorio | leer → editar → `sym check` → ajustar |
| `investigativa` | 15 | lo que haga falta dentro del territorio | sí | hipótesis → evidencia (bitácora) → cambio → `sym check` |

Una consulta LSP (definición, referencias, símbolos) no cuenta como archivo leído; leer un rango sí. Si tu tipo no alcanza para hacer la tarea, no lo estires: escribí en "Estado actual" qué ubicación te falta, `sym event <ID> blocked -m "spec: faltan ubicaciones de X"` y dormí. Un `blocked` barato vale más que una exploración cara.

## Loop

1. Si el paquete trajo feedback, decidí primero qué cambiás y qué no, y escribilo en "Estado actual". Si te relanzaron a mitad de trabajo, `sym diff <ID> --stat` te dice qué ya hiciste; no vuelvas a leer lo que no vas a tocar.
2. Trabajá en tu worktree. Commiteá por criterio (`AC-2: validar formato de mail`).
3. Antes de reportar: `sym check <ID>`. Territorio → es `blocked`; patrón prohibido → corregilo; criterio → seguí.
4. "Estado actual" después de cada paso (máximo 12 líneas: Hecho / Falta / Próximo paso / Dudas).
5. `sym check` en verde: último commit, Estado actual final, `sym event <ID> done -m "<una línea>"`. **Terminá la sesión.** Si te rechazan, `sym conduct` te relanza con el feedback en el paquete.

## Blocked

Cuando necesitás tocar fuera del territorio, un contrato no se puede cumplir como está, un criterio es imposible, o descubriste trabajo que no es tuyo: Estado actual con qué encontraste, qué opciones ves y cuál recomendás; `sym event <ID> blocked -m "<una línea>"`; terminá la sesión. No rodees el bloqueo ni le pidas al humano que avise: tu `blocked` ya despierta a tu padre.

## No hacés

Correr la suite completa ni tests a mano (solo `sym check`). Escribir tests salvo que tu partichela lo diga. Tocar `CLAUDE.md`/`AGENTS.md` ni archivos de otros nodos. Mejorar cosas fuera del alcance (anotalas en la bitácora). Quedarte en un loop de `sym wait` esperando: dormís.
