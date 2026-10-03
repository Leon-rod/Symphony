---
name: curtain-call
description: Cierre de una obra Symphony por parte del director: verificar que el PR fue aprobado, borrar worktrees y ramas de todos los nodos, archivar el estado y dejar un resumen con métricas. Usar cuando el usuario pide cerrar, limpiar o archivar una obra, o cuando el PR final fue mergeado. Requiere el skill symphony.
---

# Curtain-call

Solo el director, y solo cuando el PR a la rama base está mergeado o el desarrollador decidió abandonar la obra.

## Procedimiento

1. Confirmá con el desarrollador que la rama base ya tiene el trabajo (o que se abandona). Sin confirmación explícita, no borres nada.
2. `sym status`: no debe quedar ningún nodo `in_progress` ni `blocked`. Si hay, resolvelo o marcalo `waiting_human` y parás acá.
3. `sym clean --all`. Borra worktrees y ramas de todos los nodos salvo el director. Si la obra se mergeó, `sym clean --all --include-director` para borrar también la rama de la obra.
4. Escribí `cierre.md` en la raíz de la obra: objetivo cumplido o no, nodos totales por nivel, iteraciones promedio, upgrades y sus reglas, suite completa cuántas veces, lo que saldría distinto la próxima vez. Todo sale de `events.jsonl` y de las `evaluaciones` de las partichelas.
5. `sym event D cleaned -m "obra cerrada"`.

La carpeta `repertorio/<obra>/` queda: es el archivo de la obra. Las partichelas y la bitácora son el registro de cómo se trabajó, y `cierre.md` es lo que un futuro director lee antes de `partitura` en una obra parecida.
