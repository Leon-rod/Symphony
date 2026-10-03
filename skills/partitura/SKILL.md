---
name: partitura
description: "Segunda fase del director Symphony: convertir un brief cerrado en el árbol inicial de atriles (nodos de primer nivel con territorio, contratos y criterios) y generar el diagrama con sym score (Archify). Usar cuando el brief está confirmado y hay que armar la estructura de la obra, o cuando el usuario pide la partitura o el diagrama de agentes. Requiere el skill symphony."
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
5. Generá el diagrama con `sym score --render`. Produce `score.archify.json` (desde el registro: cada nodo es un componente, cada atril de primer nivel una región, cada relación padre-hijo una conexión) y `score.html` con Archify. No lo armes a mano: el archivo se regenera con cada evento, y cualquier edición manual se pierde. Si Archify no está instalado, `sym score` lo dice y la obra sigue igual; el diagrama es una vista, no un requisito.
6. Mostrá el árbol al desarrollador (`sym status`) y pedí confirmación. Este es un checkpoint humano: no lances atriles hasta tenerla.

## Qué NO hacer

- No crees tutti desde el director. El director solo crea atriles y nodos de reparación.
- No definas tareas chicas. Si te encontrás escribiendo "cambiar la función X", estás haciendo `arreglo`, y eso es del atril.
