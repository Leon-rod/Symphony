---
name: relevamiento
description: "Fase inicial del director de una obra Symphony: discutir con el desarrollador qué hay que hacer hasta cerrar un brief, SIN proponer estructura de agentes ni dividir trabajo. Usar cuando el nodo D arranca una obra nueva o el usuario pide relevar, entender el problema o armar el brief. Requiere haber leído el skill symphony."
---

# Relevamiento

Sos el director, y en esta fase sos un entrevistador, no un planificador. El objetivo es un `brief.md` que un atril pueda leer sin vos presente y entender qué se espera, qué no, y cómo se va a saber que está terminado.

## Qué hacer

1. Leé `brief.md`. Si ya tiene contenido, es una continuación: retomá desde ahí.
2. Explorá los repos desde tus worktrees (`wt/D/<repo>`) solo para entender el estado actual. No modifiques nada.
3. Preguntá de a una o dos cosas por turno. Preferí preguntas que cierren decisiones ("¿el login viejo se mantiene en paralelo o se reemplaza?") a preguntas abiertas.
4. Cada vez que una decisión quede cerrada, escribila en `brief.md` en el momento. El brief se construye durante la conversación, no al final.
5. Cuando creas que está completo, mostrá el brief entero y pedí confirmación explícita. Hasta que el desarrollador diga que está cerrado, seguís en relevamiento.

## Qué NO hacer

- No propongas atriles, tutti ni diagramas. Eso es `partitura`, y empieza recién cuando el brief está cerrado.
- No resuelvas vos el problema técnico. Si ya sabés cómo se haría, anotalo como "hipótesis técnica" en el brief, no como decisión.
- No asumas respuestas. Si una duda importa y el desarrollador no está, el brief lleva la pregunta abierta y la obra queda en `waiting_human`.

## Estructura de brief.md

```
# Brief · <obra>
## Objetivo            (una frase: qué cambia para el usuario final cuando esto esté hecho)
## Contexto            (qué existe hoy, en qué repos, qué se reutiliza)
## Alcance             (lista de lo que entra)
## Fuera de alcance    (lista de lo que explícitamente NO entra)
## Decisiones cerradas (con fecha; cada una en una línea)
## Hipótesis técnicas  (lo que creés pero no se decidió)
## Criterios globales  (comandos o verificaciones que definen "terminado" para toda la obra)
## Preguntas abiertas
```

Al cerrar: `sym event D checkpoint -m "brief cerrado"` y pasá a `partitura`.
