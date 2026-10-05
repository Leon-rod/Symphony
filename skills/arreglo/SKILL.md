---
name: arreglo
description: "Cómo un atril Symphony en modo plan divide su área en tareas y crea nodos hijos (tutti o sub-atriles) con territorio disjunto, contratos, criterios verificables, ubicaciones exactas, tipo, dependencias y nivel de modelo; cómo los lanza y cómo se duerme. Usar cuando un nodo en modo plan tiene que delegar, cuando recibe un blocked de un hijo, o cuando el director le pide dividir. Requiere el skill symphony."
---

# Arreglo

Dividir es la decisión más cara de la obra: cada hijo es un modelo lanzado, un worktree y una rama. Y lo que vos ya leíste para decidir, el hijo no tiene por qué volver a leerlo: por eso cada hijo nace con **ubicaciones**, no con "mirá `src/auth`".

## Antes de dividir

1. ¿Lo hacés vos en una sesión, dentro de tu territorio? `lirico` a `execute`, sin hijos.
2. ¿Hay partes con territorio disjunto que avancen en paralelo? Dividí por eso.
3. ¿Hay partes que un modelo barato hace bien si la tarea está muy bien escrita? Dividí por eso, y escribila muy bien.
4. ¿Hay partes secuenciales? `depends_on`; `sym` no lanza un hijo con dependencias sin mergear.

Si no podés escribir territorio disjunto, un criterio y ubicaciones para cada hijo, no estás listo: te falta entender el problema.

## Contratos primero

Si dos hijos comparten una interfaz, la escribís vos, completa, en los Contratos de ambos, antes de crearlos. Un tutti no ve a su hermano.

## Cada hijo nace completo

`sym node create <tuID> --kind tutti|atril --repos <subset> --tipo <tipo> [--tier N] [--depends ...] --title "..."` y completás su partichela. `sym launch` se niega si falta algo:

- **Objetivo**: una o dos frases, en términos de resultado observable.
- **Por qué se divide**: una línea.
- **Alcance y fuera de alcance**: lo segundo es lo que más ayuda a un modelo chico.
- **Contratos**: completos, con tipos.
- **Ubicaciones**: una línea por lugar, `repo:ruta:líneas · símbolo · qué hay ahí / qué hacer`, con los rangos que vos ya tenés en contexto. Obligatorias salvo tipo `investigativa`. Es la sección que más tokens ahorra en toda la obra: cada línea que escribís evita que el hijo explore. Si tenés herramientas LSP (símbolos de un archivo, referencias de un símbolo), usalas para esto antes que `grep` y `cat`: devuelven exactamente ruta, rango y símbolo.
- **Contexto**: decisiones del brief y convenciones. Breve; lo que sea una ubicación va arriba.
- **Territorio**: globs por repo, disjuntos de los hermanos.
- **Criterios**: comandos, de su territorio, nunca la suite entera.
- **Tipo**: el loop que le permitís. `mecanica` (cambio literal, ≤2 archivos), `local` (un componente, ≤4), `transversal` (varios archivos con contrato, ≤8, puede explorar en su territorio), `investigativa` (causa desconocida, ≤15). Empezá por el más chico que creas suficiente: si el hijo vuelve `blocked` con `spec`, le agregás ubicaciones o le subís el tipo.
- **Tier**: el más bajo que creas suficiente. Guía: `mecanica`/`local` bien escritas, tier 0 o 1; decisiones de diseño dentro del territorio, tier 2; tier 3 solo vía `afinacion`.

Sub-atril en vez de tutti cuando el área hija todavía no baja a tareas con criterio.

## Tests

No le pidas al implementador que escriba tests. Si hacen falta, un hijo aparte con `depends_on` sobre el implementador, territorio solo de `*.spec.*`, y Contexto que apunte a `TESTING.md` y a los criterios del implementador.

## Lanzar y dormir

No tenés terminal interactiva: no podés correr `sym launch <hijo> --exec`. Si estás en un bloque de Wave (`sym doctor` muestra `wsh`), `sym launch <hijo> --wave`. Si no, `sym tab <tuID>` y mostrale la salida al humano tal cual; él la pega en una pestaña. Nada más: ni instrucciones aparte ni mensajes para llevar.

Con los hijos lanzados, `sym event <tuID> checkpoint -m "arreglo: N hijos"`, Estado actual al día, `sym event <tuID> sleep` y **terminá la sesión**. `sym conduct` te relanza cuando un hijo marque `done` (vas a `critica`) o `blocked` (abajo), o cuando te escriban. Si esperás algo en segundos, `sym wait <tuID>` una vez; nunca en loop.

## Cuando un hijo vuelve blocked

El paquete ya te trae su Estado actual. Una de tres: ajustar su partichela (casi siempre: ubicaciones que faltaban, o subir el tipo) y `sym event <hijo> started -m "<qué cambió>"`; crear un hermano que resuelva lo descubierto; o `waiting_human` si cambia el alcance de tu área. Bitácora, y a dormir.
