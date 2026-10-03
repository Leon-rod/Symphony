---
name: afinacion
description: Decidir con datos si un hijo Symphony necesita un modelo de mayor nivel (tier), relanzarlo con el mismo ID y partichela, o pedir aprobación humana. Usar justo después de un rejected en critica, cuando un hijo repite la misma falla, o cuando el usuario pregunta por rendimiento, costo de tokens o qué modelo asignar. Requiere el skill symphony.
---

# Afinación

Subir de nivel es relanzar el mismo nodo con un modelo más capaz. Es barato porque la partichela, el worktree y los feedbacks quedan. Lo caro es subir por reflejo: cada nivel multiplica el costo de todas las iteraciones que siguen.

## Las dos fuentes

Leé `evaluaciones` en el frontmatter del hijo. Cada entrada tiene `met/total` (cuánto de lo pedido cumplió) y `fallas` (qué dijo la última crítica). Comparás la última con las anteriores.

## Reglas de decisión

Aplicá la primera que coincida:

1. Alguna falla es `spec` → **no subas**. Corregí la partichela, relanzá en el mismo nivel. Si volvés a marcar `spec` en la iteración siguiente, el problema es tu arreglo: `waiting_human`.
2. Alguna falla es `comprehension` → **subí un nivel** ahora.
3. La misma `criterion:<AC>` aparece en las últimas `afinacion.same_criterion_iterations` evaluaciones (default 2) → **subí un nivel**.
4. `met/total` bajó respecto de la evaluación anterior → **subí un nivel** (está empeorando con el feedback: señal de que no lo procesa).
5. Si no: relanzá en el mismo nivel con el feedback.

Antes de subir, mirá el `tier_history`: si ya subió una vez por la misma `criterion:<AC>`, la tarea probablemente está mal cortada. Preferí dividirla (`arreglo`) a subir de nuevo.

## Cómo subir

`sym event <hijo> upgraded -m "<regla que aplicaste y evidencia>"`. Si el nuevo nivel supera `afinacion.auto_upgrade_up_to_tier`, `sym` deja al hijo en `waiting_human` con un `UPGRADE_REQUEST` en su bitácora; informalo al desarrollador en una línea con la evidencia y esperá. Cuando apruebe: `sym event <hijo> upgraded --approved`.

Después del upgrade, `sym launch <hijo>` arma el comando con el nuevo modelo. Relanzá.

## Bajar

No hay evento de bajar: un nodo no vuelve atrás dentro de una obra. Pero anotá en tu bitácora cuando un hijo de nivel bajo acepta a la primera: esa es la evidencia para arrancar más bajo en la próxima obra. `events.jsonl` tiene todo para analizarlo después.

## Informar

Cuando el desarrollador pregunte por rendimiento, respondé con datos de `evaluaciones` y `events.jsonl`: nodos por nivel, iteraciones promedio por nivel, upgrades y por qué regla. No opines sin esos datos.
