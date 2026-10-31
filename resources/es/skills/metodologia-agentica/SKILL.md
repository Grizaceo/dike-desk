---
name: metodologia-agentica
description: >-
  Úsala al investigar una cuestión jurídica que pueda cambiar una conclusión, un escrito, un plazo o una estrategia: 7 pasos con criterios de parada y escalación. /
  Use when researching a legal question that can change a conclusion, a brief, a deadline or a strategy: 7 steps with stopping and escalation criteria.
---

# Metodología agéntica de investigación jurídica

LexO no es un buscador semántico. Investiga como un abogado: formula el problema, compara hipótesis, reúne evidencia tipada, la verifica y decide cuándo basta.

## Los 7 pasos

1. **Formulación del problema.** Pregunta jurídica exacta, jurisdicción, materia, tipo de problema (normativo, jurisprudencial, procedimental, administrativo o mixto), fuente prioritaria, entidades (sujetos, actos, fechas) y ambigüedades.
2. **Hipótesis.** Abre entre 1 y 4 respuestas plausibles cuando la ambigüedad sea material. Para cada una, anota qué la confirmaría y qué la derrotaría.
3. **Búsqueda tipada.** Planifica la búsqueda por tipo de fuente: norma, jurisprudencia, acto administrativo y doctrina. Si una ruta trae poco, reformula con sinónimos de la materia y después sube a la materia superior (por ejemplo, de una causal de despido a los derechos fundamentales involucrados). Si aún no hay nada, regístralo como vacío de impacto alto. Si no tienes una herramienta autorizada para consultar, dilo y pide el texto: no simules la consulta.
4. **NIF.** Organiza hechos, sujetos, normas, actos, principios, posiciones deónticas, conflictos, excepciones, lagunas, hipótesis y evidencia a favor y en contra (skill `nif-y-logica-de-normas`).
5. **Evidencia y verificación.** Para cada afirmación material conserva: identificador de la fuente, localizador preciso del pasaje, hash cuando una herramienta lo entregue, texto pertinente, fecha o versión, ámbito y estado de verificación. Para citas del escrito usa el `citationId` y los campos `sourceUrl` y `textSha256` de `get-brief`. No inventes hashes ni confundas `pack_hash` con el hash de una fuente concreta. Si una fuente externa carece de hash o de localizador suficiente, declara esa limitación. Las citas normativas del escrito se verifican con `verify-brief`; la jurisprudencia y la doctrina quedan `[VERIFICAR CITA]` hasta contrastarlas con su fuente.
6. **Suficiencia.** Decide si es suficiente, si conviene seguir o si hay que escalar (criterios abajo).
7. **Memo.** Conclusión suficiente, provisional o insuficiente, vacíos explícitos y la próxima decisión humana. Quien continúe el trabajo hereda las referencias, no solo la conclusión.

## Decidir cuándo parar

Aplica estos criterios en orden:

1. **Escalar al abogado** prevalece sobre todo lo demás cuando:
   - hay un conflicto normativo relevante sin resolver;
   - falta una fuente primaria o un hecho indispensable;
   - la evidencia se divide sin un criterio razonable de desempate;
   - la cita central no es verificable;
   - el caso depende de una valoración jurídica que no se puede formalizar.
2. **Declarar suficiente** solo si están cubiertas las fuentes y los hechos indispensables, las citas se contrastaron y no queda un derrotador material sin tratar.
3. **Detener sin suficiencia:** dos rondas seguidas sin novedad, dos rondas sin mejora de la confianza o el agotamiento de los límites detienen la búsqueda, pero no prueban suficiencia. Entrega un memo provisional o insuficiente con la evidencia que falta, y escala si es material.
4. **Seguir** solo si puedes nombrar una hipótesis viva, la evidencia que falta, una ruta concreta para obtenerla y una expectativa razonable de mejora.

Límites: máximo 4 hipótesis activas, 3 rondas de refinamiento y 12 evidencias candidatas por ronda.

## Checklist antes de responder

- [ ] La pregunta está clasificada y la fuente principal identificada.
- [ ] Hay entre 1 y 4 hipótesis.
- [ ] Hay al menos una fuente primaria pertinente.
- [ ] Las citas usadas se contrastaron con el texto y tienen localizador, o están marcadas.
- [ ] La vigencia se comprobó cuando importa (vigencia ≠ fecha del documento).
- [ ] No se ignoró ninguna contradicción grave.
- [ ] Los vacíos persistentes están escritos.

Suficiencia por tipo de consulta:

- **Norma:** texto, artículo con su inciso, numeral o letra cuando corresponda, y vigencia.
- **Jurisprudencia:** tribunal, rol u otro identificador real, fecha, y el considerando o pasaje que sostiene la ratio.
- **Acto administrativo:** identificación, emisor y vínculo con el caso.
- **Plazo:** norma procesal, hitos y criterio jurisprudencial si existe.

## Límites honestos

Esta metodología no ejecuta motores formales de argumentación ni de verificación lógica. Lo formal se reduce a estructurar el NIF y a la constancia de Diké; el resto es juicio del abogado. Ver `context/fundamentos-metodologia.md`.
