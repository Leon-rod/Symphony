---
name: partichela
description: "Cómo un nodo Symphony lee, escribe y mantiene su partichela (archivo de estado) y las de sus hijos, incluyendo el checkpoint de 'Estado actual', la bitácora y el procedimiento para relanzar un nodo desde cero con solo su ID. Usar cada vez que un nodo arranca, retoma después de perder contexto, o tiene que registrar progreso. Requiere el skill symphony."
---

# Partichela

La partichela es tu única memoria. El skill `symphony` dice *que* hay que mantenerla; este dice *cómo*.

## Al arrancar

Seguí "Arranque de un nodo" de `symphony`. Lo que leés, en orden: tu partichela, `symphony.yaml`, tus `feedback-*.md` (el último manda), las partichelas de tus hijos directos. Después `sym event <ID> started`.

Si "Estado actual" dice "Sin empezar", sos nuevo: tu primer trabajo es leer Objetivo, Alcance, Contratos y Contexto, y escribir en "Estado actual" tu plan en tres a seis líneas antes de tocar código. Si dice otra cosa, retomá exactamente desde ahí.

## Checkpoint: "Estado actual"

Reescribilo (no lo apendees) después de cada acción significativa: terminar un paso del plan, tomar una decisión, encontrar un bloqueo, antes de correr `sym check`. Tiene que responder cuatro preguntas en presente:

```
## Estado actual
Hecho: ...
Falta: ...
Próximo paso: ...
Dudas o riesgos: ...
```

Prueba de calidad: si te mataran ahora y te relanzaran, ¿con esto seguirías sin volver a explorar? Si no, le falta algo.

## Bitácora

Append-only, una línea por hecho, con fecha ISO. `sym event` ya agrega líneas por vos; vos agregás decisiones y por qué. Nunca borres ni edites líneas anteriores.

## Frontmatter

- Lo que es tuyo para editar: `mode` (vía `lirico`), `territorio`, `criterios` y `evaluaciones` **de tus hijos**, `depends_on` de tus hijos al crearlos.
- Lo que no tocás nunca: `id`, `obra`, `parent`, `kind`, `branch`, `created_at`, `children`, `status`, `iteration`, `tier`, `tier_history`. Eso lo escribe `sym`.
- Mantené el YAML válido. Si dudás, `sym node show <ID>` lo parsea y te avisa.

## Feedback a un hijo

Al rechazar: escribí `nodes/<hijo>/feedback-<n>.md` (n = iteración actual del hijo), agregá la entrada en `evaluaciones` de su frontmatter, y recién después `sym event <hijo> rejected -m "<categorías>"`. El orden importa: el hijo relanzado lee el feedback antes de ver el estado.

```
# Feedback <n> · <hijo>
## Veredicto: rejected
## Fallas
- criterion:AC-3 — <qué falló, salida relevante del comando>
- convention — <qué regla de TESTING.md y dónde>
## Qué cambiar
<instrucciones concretas, en orden>
## Qué NO cambiar
<lo que ya estaba bien; evita que lo rompa al iterar>
```
