---
name: arreglo
description: "Cómo un atril Symphony en modo plan divide su área en tareas y crea nodos hijos (tutti o sub-atriles) con territorio disjunto, contratos, criterios verificables, dependencias y nivel de modelo. Usar cuando un nodo en modo plan tiene que delegar, cuando recibe un blocked de un hijo y debe replanificar, o cuando el director le pide dividir. Requiere el skill symphony."
---

# Arreglo

Dividir es la decisión más cara de la obra: cada hijo es un modelo lanzado, un worktree y una rama. Dividí lo justo.

## Antes de dividir

Preguntate, en este orden:

1. ¿Puedo hacerlo yo en una sesión, dentro de mi territorio? Entonces `lirico` a `execute` y no dividas.
2. ¿Hay partes con territorio disjunto que puedan avanzar en paralelo? Dividí por eso.
3. ¿Hay partes que un modelo barato puede hacer bien si la tarea está muy bien especificada? Dividí por eso, y especificá muy bien.
4. ¿Hay partes secuenciales? Dividí igual pero con `depends_on`; `sym` no lanza un hijo hasta que su dependencia esté `merged`.

Si no podés escribir territorio disjunto y un criterio verificable para cada hijo, no estás listo para dividir: te falta entender el problema. Explorá más o marcá `waiting_human` con la duda.

## Contratos primero

Si dos hijos van a compartir una interfaz (un tipo, un endpoint, un evento, una firma), la definís vos, completa, en la sección Contratos de ambos, **antes** de crearlos. Un tutti no negocia interfaces con un hermano: no lo ve.

## Cada hijo nace completo

`sym node create <tuID> --kind tutti|atril --repos <subset> [--tier N] [--depends ...] --title "..."` y después completás su partichela. `sym launch` se niega si falta algo. Lo que tiene que tener:

- **Objetivo**: una o dos frases, en términos de resultado observable.
- **Por qué se divide**: una línea. Si no te sale, revisá el punto 1.
- **Alcance y fuera de alcance**: lo segundo es lo más importante para modelos chicos.
- **Contratos**: completos, con tipos.
- **Contexto**: qué archivos mirar, qué decisiones del brief aplican, qué convenciones del repo. Señalá, no pegues.
- **Territorio**: globs por repo, disjuntos de los hermanos. Verificá a mano que no se solapen.
- **Criterios**: comandos. Como mínimo lint o build del territorio y una verificación del comportamiento. Nada que requiera correr la suite entera (regla 7).
- **Tier**: el más bajo que creas suficiente. Guía: tareas mecánicas y bien delimitadas, nivel 0 o 1; tareas que requieren decidir diseño dentro del territorio, nivel 2; nunca nivel 3 para un tutti sin pasar por `afinacion`.

Sub-atril en vez de tutti cuando el área hija todavía no se puede bajar a tareas con criterio. El sub-atril hará su propio `arreglo`.

## Tests

No le pidas a un tutti implementador que escriba tests. Si el área necesita tests, creá un hijo de tests aparte, con `depends_on` sobre el implementador, territorio solo de `*.spec.*` (o el patrón del repo), y Contexto que apunte al `TESTING.md` del repo y a los criterios del implementador.

## Cuando un hijo marca blocked

`sym wait` ya te trajo su "Estado actual" con lo que encontró y lo que recomienda. Decidí una de tres: ajustar su partichela y relanzarlo (`sym event <hijo> started -m "<qué cambió>"`; si solo necesita una aclaración, `sym tell <hijo> -m "..." --from <tuID>` y después el `started`), crear un hermano nuevo que resuelva lo descubierto (con `depends_on` si corresponde), o marcar `waiting_human` si lo descubierto cambia el alcance de tu área. Registralo en tu bitácora y volvé a `sym wait`.

## Lanzar a los hijos

Vos no tenés terminal interactiva, así que no podés correr `sym launch <hijo> --exec` (el runner interactivo no puede abrirse adentro tuyo). Dos caminos:

- Si estás dentro de un bloque de Wave (`sym doctor` muestra `wsh`), `sym launch <hijo> --wave` abre al hijo en un bloque nuevo de tu misma pestaña.
- Si no, o si el humano prefiere una pestaña por atril: corré `sym tab <tuID>` y mostrale la salida tal cual. Es un bloque de comandos que él pega en una pestaña nueva y abre tu tablero enfocado, tu partichela y tus hijos. Eso es todo lo que le pedís: no le dictes mensajes ni instrucciones aparte.

En cuanto haya hijos lanzados, entrás al loop: `sym wait <tuID>` → leer qué volvió → actuar → `sym wait <tuID>`. Un hijo `done` te manda a `critica`; un hijo `blocked`, a la sección de abajo; un mensaje, a leerlo. No salgas del loop hasta que todos tus hijos estén `merged`.

Al terminar de dividir: `sym event <tuID> checkpoint -m "arreglo: N hijos"` y pasá a `review` con `lirico` cuando el primero marque `done`.
