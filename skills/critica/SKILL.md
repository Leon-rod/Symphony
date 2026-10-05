---
name: critica
description: "Cómo un nodo padre Symphony evalúa a un hijo que marcó done: sym check, sym diff, revisión contra territorio y contratos, clasificación de fallas en categorías fijas, veredicto accepted o rejected con feedback, y vuelta a dormir. Usar cuando un hijo está en done y el padre pasa a modo review. Requiere el skill symphony."
---

# Crítica

Evaluás contra lo que está escrito en la partichela del hijo. Lo que no está escrito no se evalúa; si te molesta algo no escrito, es `spec`, y es tuyo.

## Procedimiento

1. `sym check <hijo>`. Si falla, ya tenés fallas clasificadas: `criterion:<AC>`, `convention` (patrón prohibido) o `scope` (territorio).
2. `sym diff <hijo> --stat`, y después `sym diff <hijo>` solo si el stat no te alcanza. No abras los archivos del hijo enteros: el diff es la evidencia. Buscá contratos no respetados (`criterion` o `spec`, según cómo estaban escritos), cambios fuera de alcance aunque dentro de territorio (`scope`), código que indica que no entendió el objetivo (`comprehension`).
3. Si escribió tests, leelos en el diff: trazabilidad `// AC-n` en ambos sentidos, `expect` sobre comportamiento y no sobre implementación, ningún assert existente relajado. Lo que viole `TESTING.md` es `convention`.
4. El paquete ya trajo su Estado actual: dudas que anotó y no resolvió pueden ser `spec` tuyos.

## Veredicto

**accepted**: `sym check` pasa, contratos respetados, sin fallas. `evaluaciones` del hijo: `{iteration, met: total, total, fallas: []}`. `sym event <hijo> accepted`.

**rejected**: `feedback-<n>.md` (máximo 20 líneas: fallas clasificadas, qué cambiar en orden, qué no tocar; formato en `partichela`), entrada en `evaluaciones`, `sym event <hijo> rejected -m "<categorías>"`. Antes de que lo relancen, `afinacion` decide si sube de tier. Si la falla es `spec`, corregís su partichela (ubicaciones, contratos, criterios) **antes** del `rejected`, y no cuenta como falla del modelo.

Después del veredicto: si quedan hijos activos, Estado actual y `sym event <tuID> sleep`; si todos están `accepted`, `lirico` a `integrate`.

Categorías, siempre estas: `spec` · `scope` · `criterion:<AC-id>` · `convention` · `comprehension`.

## No hacés

Arreglar vos el código del hijo (explicalo: estás entrenando la partichela). Pedir cambios que no salgan de un criterio, un contrato o `TESTING.md`. Correr la suite completa.
