---
# Lo llena `sym`. No edites id, obra, parent, kind, branch ni worktrees a mano.
id: {{id}}
obra: {{obra}}
parent: {{parent}}
kind: {{kind}}              # atril | tutti | reparacion | director
children: []
mode: {{mode}}              # plan | execute | review | integrate | done
status: planned             # ver protocolo de estados en el skill symphony
iteration: 1
tier: {{tier}}              # índice en tiers de symphony.yaml; afinacion lo sube
tier_history: [{{tier}}]
repos: {{repos}}
branch: {{branch}}
origin: {{origin}}          # solo en nodos de reparación: ID del nodo responsable
depends_on: []              # IDs de hermanos que deben estar merged antes de lanzar este nodo
created_at: {{created_at}}

# Territorio: lo que este nodo puede tocar. Globs relativos a cada repo. Disjunto de los hermanos.
territorio: []
#  - api: src/auth/**
#  - web: src/app/login/**

# Criterios de aceptación: comandos que deben salir en 0. `sym check` los corre en el worktree del repo.
criterios: []
#  - id: AC-1
#    repo: api
#    cmd: npm run lint
#  - id: AC-2
#    repo: api
#    cmd: npx vitest run src/auth

# Evaluaciones: las agrega el padre (critica) en cada iteración. afinacion las lee.
# fallas usa las categorías fijas: spec | scope | criterion:<AC-id> | convention | comprehension
evaluaciones: []
#  - iteration: 1
#    met: 3
#    total: 5
#    fallas: [criterion:AC-3, convention]
---

# {{id}} · {{title}}

## Objetivo
<!-- Una o dos frases. Lo escribe el padre al crear el nodo. -->

## Por qué se divide
<!-- Solo en nodos creados por un atril: una línea que justifique esta división. -->

## Alcance y fuera de alcance
<!-- Qué entra y, sobre todo, qué NO entra. Lo que no está acá no se hace. -->

## Contratos
<!-- Interfaces, tipos, endpoints o firmas que este nodo debe respetar. Si comparte interfaz con un hermano, el padre la escribe acá ANTES de lanzar a ambos. -->

## Contexto
<!-- Lo mínimo que un modelo recién lanzado necesita saber del sistema para hacer esta tarea. Rutas, decisiones previas, enlaces a brief.md. No pegues código entero: señalá dónde mirar. -->

## Estado actual
<!-- LO REESCRIBE EL NODO después de cada acción significativa. Es lo primero que leés al relanzar. Debe responder: qué hice, qué falta, qué estaba por hacer, qué dudas tengo. -->
Sin empezar.

## Bitácora
<!-- Append-only. Una línea por hecho relevante, con fecha. Decisiones, bloqueos, criterios que fallaron, por qué. -->
- {{created_at}} · creado por {{parent}}
