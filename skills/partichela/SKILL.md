---
name: partichela
description: "Cómo un nodo Symphony lee, escribe y mantiene su partichela (archivo de estado) y las de sus hijos: el paquete de arranque de sym node show, el checkpoint de Estado actual, la bitácora, el inbox y el formato de feedback. Usar cada vez que un nodo arranca, retoma, o tiene que registrar progreso o rechazar a un hijo. Requiere el skill symphony."
---

# Partichela

La partichela es tu única memoria. `symphony` dice *que* hay que mantenerla; este dice *cómo*.

## Leer

`sym node show <ID>` es la única lectura que hacés al arrancar. Trae lo que aplica y nada más; el archivo crudo (`--raw`) existe para editarlo, no para leerlo. Si el paquete dice `status planned` y Estado actual no aparece, sos nuevo: leé Objetivo, Contratos, Ubicaciones y Contexto del paquete, y escribí tu plan en Estado actual **antes** de tocar código. Si hay Estado actual, retomá desde ahí.

## Estado actual

Reescribilo (no apendees) después de cada acción significativa. Máximo 12 líneas, presente, cuatro preguntas:

```
## Estado actual
Hecho: ...
Falta: ...
Próximo paso: ...
Dudas o riesgos: ...
```

Prueba: si te relanzaran ahora con solo esto, ¿seguirías sin volver a explorar? Si no, le falta algo.

## Bitácora

Append-only, una línea por hecho, con fecha. `sym event` ya agrega líneas; vos agregás decisiones y por qué.

## Frontmatter

Tuyo para editar: `mode` (vía `lirico`); de tus hijos: `territorio`, `criterios`, `tipo`, `depends_on`, `evaluaciones`. Nunca: `id`, `obra`, `parent`, `kind`, `branch`, `created_at`, `children`, `status`, `iteration`, `tier`, `tier_history`. YAML válido siempre; `sym node show` te avisa si se rompió.

## Inbox

`nodes/<ID>/inbox.md` lo escribe `sym tell`; el paquete te muestra solo lo nuevo. Contestás con `sym tell <quien> -m "..." --from <tuID>`.

## Feedback a un hijo

Antes del `sym event <hijo> rejected`: escribí `nodes/<hijo>/feedback-<n>.md` (n = su iteración actual) y la entrada en `evaluaciones`. Máximo 20 líneas:

```
# Feedback <n> · <hijo>
## Fallas
- criterion:AC-3 — <qué falló, las 3 líneas relevantes de la salida>
- convention — <regla de TESTING.md y dónde>
## Qué cambiar (en orden)
## Qué NO cambiar
```

Si agregás ubicaciones o corregís contratos (falla `spec`), va en su partichela, no en el feedback: el feedback dice "releé Ubicaciones".
