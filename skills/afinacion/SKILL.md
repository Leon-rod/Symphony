---
name: afinacion
description: "Decidir con datos si un hijo Symphony necesita un modelo de mayor nivel (tier), relanzarlo con el mismo ID y partichela, o pedir aprobación humana; y leer sym cost para saber cuánto cuesta cada nodo y cada tier. Usar justo después de un rejected en critica, cuando un hijo repite la misma falla, o cuando el usuario pregunta por rendimiento, tokens o qué modelo asignar. Requiere el skill symphony."
---

# Afinación

Subir de tier es relanzar el mismo nodo con un modelo más capaz: partichela, worktree y feedbacks quedan. Lo caro es subir por reflejo: cada nivel multiplica el costo de todas las iteraciones siguientes.

## Las dos fuentes

`evaluaciones` del hijo (en el paquete): `met/total` por iteración y las `fallas` de la última crítica. Comparás la última con las anteriores.

## Reglas, la primera que coincida

1. Hay `spec` → **no subas**. Corregí la partichela (casi siempre ubicaciones), mismo tier. Si repetís `spec` en la iteración siguiente, el problema es tu arreglo: `waiting_human`.
2. Hay `comprehension` → **subí un nivel** ahora.
3. La misma `criterion:<AC>` en las últimas `same_criterion_iterations` evaluaciones (2) → **subí un nivel**.
4. `met/total` bajó respecto de la anterior → **subí un nivel**.
5. Si no: mismo tier, con el feedback.

Antes de subir, mirá `tier_history`: si ya subió por la misma `criterion`, la tarea está mal cortada; dividila (`arreglo`) en vez de subir de nuevo.

## Cómo

`sym event <hijo> upgraded -m "<regla y evidencia>"`. Si el nuevo tier supera `auto_upgrade_up_to_tier`, `sym` lo deja en `waiting_human` con un `UPGRADE_REQUEST`; informá al humano en una línea y dormí. Aprobado: `sym event <hijo> upgraded --approved`. `sym conduct` relanza al hijo con el modelo nuevo.

## Medir

`sym cost` lee los logs de sesión de Codex y Claude Code y suma tokens por nodo y por tier: input, cacheados, razonamiento, output, y "equivalentes por nodo aceptado". Cuando el humano pregunte por rendimiento o tokens, respondé con eso, no con impresiones. Lo que buscás es el tier más barato cuyo costo por nodo aceptado no se dispare por reintentos: un tier bajo con tres iteraciones y un upgrade puede costar más que un tier medio a la primera. Anotá en tu bitácora cuando un hijo de tier bajo acepta a la primera: es la evidencia para arrancar más bajo en la próxima obra.
