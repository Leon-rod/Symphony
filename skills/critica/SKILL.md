---
name: critica
description: "Cómo un nodo padre Symphony evalúa a un hijo que marcó done: correr sym check, revisar el diff contra territorio y contratos, clasificar las fallas en categorías fijas y emitir accepted o rejected con feedback. Usar cuando un hijo está en done y el padre pasa a modo review. Requiere el skill symphony."
---

# Crítica

Evaluás contra lo que está escrito en la partichela del hijo. Lo que no está escrito no se evalúa; si te molesta algo que no está escrito, es un defecto de la partichela (categoría `spec`), no del hijo.

## Procedimiento

1. `sym check <hijo>`. Si falla, ya tenés al menos una falla clasificada: `criterion:<AC>`, `convention` (patrón prohibido) o `scope` (territorio).
2. Leé el diff: `git -C wt/<hijo>/<repo> diff <tu rama>`. Buscá: contratos no respetados (`criterion` o `spec` según estén bien escritos), cambios fuera de alcance aunque dentro de territorio (`scope`), código que sugiere que no entendió el objetivo (`comprehension`).
3. Si el hijo escribió tests: leé los archivos de test en el diff (no los corras aparte: `sym check` ya corrió los criterios). Verificá trazabilidad `// AC-n` en ambos sentidos, que cada test tenga un `expect` sobre el comportamiento y no sobre la implementación, y que no haya asserts existentes relajados. Lo que viole `TESTING.md` es `convention`.
4. Leé su "Estado actual" y bitácora. Dudas o riesgos que anotó y no resolvió pueden ser `spec` tuyos.
5. Veredicto.

## Veredicto

**accepted** si `sym check` pasa, los contratos se respetan y no hay fallas. Agregá a `evaluaciones` del hijo `{iteration, met: total, total, fallas: []}` y `sym event <hijo> accepted`.

**rejected** en cualquier otro caso. Escribí `feedback-<n>.md` (formato en el skill `partichela`), agregá la entrada en `evaluaciones` con las fallas clasificadas, y `sym event <hijo> rejected -m "<categorías separadas por coma>"`. Después consultá `afinacion` antes de relanzar.

En los dos casos, después del veredicto volvés a `sym wait <tuID>`: el hijo rechazado está esperando tu `rejected` para releer el feedback y seguir; no hace falta avisarle nada más.

Si la falla es `spec`: corregí la partichela del hijo (Objetivo, Contratos, Criterios, lo que haya estado mal) **antes** de relanzarlo, y decilo en el feedback. No cuentes `spec` como falla del modelo.

## Categorías (fijas)

`spec` · `scope` · `criterion:<AC-id>` · `convention` · `comprehension`. Usá siempre estas; `afinacion` las lee mecánicamente.

## Lo que no hacés

- No arreglás vos el código del hijo. Si es más rápido hacerlo que explicarlo, igual explicalo: estás entrenando la partichela para la próxima.
- No pedís cambios que no se desprendan de un criterio, un contrato o `TESTING.md`.
