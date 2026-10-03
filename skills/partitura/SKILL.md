---
name: partitura
description: Segunda fase del director Symphony: convertir un brief cerrado en el árbol inicial de atriles (nodos de primer nivel con territorio, contratos y criterios) y generar el diagrama con Archify. Usar cuando el brief está confirmado y hay que armar la estructura de la obra, o cuando el usuario pide la partitura o el diagrama de agentes. Requiere el skill symphony.
---

# Partitura

Del brief al primer nivel del árbol. Solo el primer nivel: los atriles dividen lo suyo después, con `arreglo`. Vos definís *áreas*, no tareas.

## Qué hacer

1. Releé `brief.md` completo. Si tiene preguntas abiertas que afectan la estructura, no sigas: `waiting_human`.
2. Identificá áreas de trabajo con territorio disjunto. Un área es un atril. Criterios para cortar:
   - Un área por frontera natural del sistema (un repo, un módulo, una capa) antes que por tipo de tarea.
   - Si dos áreas tienen que compartir una interfaz, escribí esa interfaz en los **Contratos** de ambas antes de crearlas.
   - Si solo hay un área, hay un solo atril. No inventes paralelismo.
3. Creá cada atril con `sym node create D --kind atril --repos <repos> --title "<área>"` y completá su partichela: Objetivo, Alcance, Contratos, Territorio, Criterios, Contexto (señalá dónde mirar en el repo, no pegues código). Tier: el que indique `default_tier.atril` salvo que el área sea claramente trivial o claramente difícil.
4. Si el área pide tests, no los asignes al atril: anotá en su Contexto que debe crear un nodo de tests aparte.
5. Generá el diagrama: pedile a Archify un diagrama de tipo *architecture* donde cada nodo es un agente, las agrupaciones son atriles y las aristas van de padre a hijo. Guardalo como `score.archify.json` y `score.html` en la raíz de la obra. Si Archify no está disponible, dejá un `score.md` con el árbol en texto; no bloquees la obra por el dibujo.
6. Mostrá el árbol al desarrollador (`sym status`) y pedí confirmación. Este es un checkpoint humano: no lances atriles hasta tenerla.

## Qué NO hacer

- No crees tutti desde el director. El director solo crea atriles y nodos de reparación.
- No definas tareas chicas. Si te encontrás escribiendo "cambiar la función X", estás haciendo `arreglo`, y eso es del atril.
