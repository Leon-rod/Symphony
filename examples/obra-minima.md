# Obra mínima, paso a paso

Un repo, un director, un atril, dos tutti (uno implementa, otro testea). Todo con `sym`; los runners los lanzás vos en bloques de Wave (o terminales) con el comando que `sym launch` imprime.

```
# 1. La obra y el director
sym init login-validate --repos api=~/code/api --base main --root ~/repertorio
cd ~/repertorio/login-validate
sym launch D --wave              # o --exec si no estás en Wave
#   → el director hace `relevamiento` con vos, escribe brief.md,
#     y en `partitura` crea el atril:
#       sym node create D --kind atril --title "Auth" --repos api
#     completa nodes/A1/partichela.md y pide tu confirmación.

# 2. El atril
sym launch A1 --exec
#   → `arreglo`: crea dos hijos, con el segundo dependiendo del primero
#       sym node create A1 --kind tutti --title "validate()"      --tier 1
#       sym node create A1 --kind tutti --title "tests validate" --tier 0 --depends A1.T1
#     completa territorio, contratos, criterios y objetivo de cada uno.

# 3. El tutti implementador (bloque aparte)
sym launch A1.T1 --exec
#   → `ensayo`: trabaja en wt/A1.T1/api, commitea, `sym check A1.T1`, `sym event A1.T1 done`

# 4. El atril evalúa, integra, y recién ahí se puede lanzar el tester
#   → `critica`: sym check A1.T1 + diff → sym event A1.T1 accepted
#   → `ensamble`: sym merge A1.T1
sym launch A1.T2 --exec          # antes de esto, sym se niega: A1.T1 no estaba merged
#   → el tester lee TESTING.md, escribe tests con // AC-n, done.
#   → `critica` corre sym check y lee el diff; si rechaza dos veces por el mismo AC,
#     `afinacion` lo sube: sym event A1.T2 upgraded → sym launch A1.T2

# Tablero (en cualquier momento, en otro bloque)
sym board --wave                 # diagrama en vivo; cada sym event lo actualiza

# 5. Cierre
#   → el atril mergea A1.T2, corre sus criterios, done.
#   → el director mergea A1, corre la suite completa, abre el PR.
sym status
sym clean --all                  # curtain-call, cuando el PR esté mergeado
```

`sym status` en cualquier momento:

```
obra: login-validate  ·  ~/repertorio/login-validate
D  director   in_progress    integrate tier 3  iter 1  Director
  A1  atril      merged         done      tier 2  iter 1  Auth
    A1.T1  tutti      merged         done      tier 1  iter 1  validate()
    A1.T2  tutti      merged         done      tier 1  iter 3  tests validate
```
