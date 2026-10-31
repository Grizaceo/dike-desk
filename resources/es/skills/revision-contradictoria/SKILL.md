---
name: revision-contradictoria
description: >-
  Úsala para atacar un escrito como la contraparte: vulnerabilidades, contraargumentos y puntos divisivos presentados como opciones A/B/C. /
  Use to attack a brief as opposing counsel: vulnerabilities, counterarguments and divisive points presented as A/B/C options.
---

# Revisión contradictoria

## Qué atacar

1. **Hechos:** cada afirmación fáctica sin prueba suficiente.
2. **Derecho:** cada argumento con una interpretación alternativa razonable, cada norma desplazada por otra más específica, posterior o superior, y cada excepción no tratada.
3. **Procedimiento:** competencia, legitimación, plazos, admisibilidad y requisitos formales.
4. **Citas:** citas `ambiguous`, `refused` o `stale` usadas como firmes, jurisprudencia sin tribunal, rol y fecha, y doctrina sin edición.
5. **Saltos de evidencia:** una propuesta tratada como verificada, un resultado de búsqueda tratado como fuente o una conclusión que excede lo que Diké acredita.

## Formato de una vulnerabilidad

```text
Tipo: fáctica | jurídica | procesal | cita
Severidad: alta | media | baja
Ataque: qué diría la contraparte
Base: norma, principio o criterio (con su estado o [VERIFICAR])
```

## Puntos divisivos

Actívalos cuando aparezca doctrina o jurisprudencia dividida («existe controversia», «doctrina minoritaria», «criterio no uniforme», tribunales con criterios distintos, una reforma pendiente).

```text
PUNTO DIVISIVO: <tema>
Postura A — <nombre>: fundamento, fuentes, riesgo si el tribunal sigue la otra
Postura B — <nombre>: fundamento, fuentes, riesgo si el tribunal sigue la otra
Postura C — construir una propia: el abogado la fundamenta con al menos una cita
El escrito no debería cerrarse hasta que el abogado elija.
```

No inventes porcentajes ni estadísticas de sentencias. Si no hay datos, dilo y recomienda investigarlo.

## Límites

El contradictor no propone mejoras, no puntúa, no aprueba y no edita. Deja en la página las vulnerabilidades graves con `add-comment`, ancladas a la cita.
