---
name: ensamble
description: "Cómo un nodo padre Symphony integra a sus hijos aceptados en su propia rama con sym merge, en orden de dependencias, resuelve conflictos, corre sus criterios propios y reporta done; y cómo el director hace la integración final, la suite completa y el PR. Usar cuando todos los hijos están accepted y el nodo pasa a modo integrate, o cuando el director integra atriles. Requiere el skill symphony."
---

# Ensamble

Mergeás solo hijos directos, en tu worktree, en orden. Nunca rebaseás sobre hermanos.

## Procedimiento

1. Tu worktree limpio: todo commiteado (`sym merge` se niega si no).
2. Orden: respetá `depends_on`; entre independientes, el orden de creación.
3. Por cada hijo: `sym merge <hijo>`. Si hay conflicto, lo resolvés vos, en tu worktree, con las partichelas de ambos hijos abiertas: vos sos el único que sabe qué quería cada uno. Commiteá la resolución y `sym event <hijo> merged`.
4. Con todos mergeados: `sym check <tuID>` (tus criterios, no los de ellos, y no la suite entera). Si falla, `sym diff <tuID> --stat` antes de abrir cualquier archivo.
5. Si falla algo que un hijo rompió al combinarse con otro, no lo arregles a mano: creá un hijo nuevo de reparación acotado (kind `tutti`, territorio mínimo, criterio = lo que falla) o, si es chico y está en tu territorio, `lirico` a `execute` y arreglalo vos. Registrá cuál elegiste y por qué.
6. "Estado actual" con un resumen de lo integrado y `sym event <tuID> done`. Terminá la sesión: tu padre te relanza si te rechaza.

## El director

Integra los atriles de primer nivel en `symphony/<obra>/D` igual que arriba, y después:

1. Corre la suite completa de cada repo (los "Criterios globales" del brief). Cada corrida cuenta para `limits.max_global_suite_runs`; registrala: `sym event D checkpoint -m "suite completa #n: <resultado>"`.
2. Si falla: `sym blame <repo>/<archivo>` por cada archivo implicado, y por cada nodo responsable un `D.R<n>` con `--origin`. El nodo de reparación lee la partichela de origen como contexto, trabaja sobre la rama de la obra, y al terminar vuelve al paso 1.
3. Si pasa: abrí el PR de `symphony/<obra>/D` a la rama base, con el brief como descripción y el `score.html` adjunto o enlazado. `sym event D waiting_human -m "PR abierto"` y terminá la sesión. Symphony no mergea a la rama base.
4. Aprobado el PR, `curtain-call`.
