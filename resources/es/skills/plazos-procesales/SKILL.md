---
name: plazos-procesales
description: >-
  Úsala cuando una pregunta toque plazos o hitos procesales: datos necesarios, norma que rige, forma de cómputo y qué debe confirmar el abogado. /
  Use when a question touches procedural deadlines or milestones: required data, governing rule, how to count, and what the lawyer must confirm.
---

# Plazos procesales (guía)

Diké Desk no tiene calendario ni alertas. Esta skill orienta; no reemplaza el control de plazos del despacho.

## Datos necesarios antes de calcular

1. El hecho que inicia el plazo y su fecha exacta (normalmente la notificación válida, no la fecha de la resolución; la norma puede fijar otro hecho).
2. El tipo de procedimiento y el tribunal o la autoridad.
3. La actuación: recurso, contestación, observaciones u otra.
4. La norma que fija el plazo.

Si falta cualquiera de los cuatro, pídelo y no calcules.

## Cómputo

1. Identifica la norma y su texto; si no tiene estado `verified` en la constancia vigente, márcala `[VERIFICAR]`.
2. Determina si la norma fija días hábiles o corridos, y cómo trata feriados y suspensiones. No lo presumas: depende del cuerpo legal y del procedimiento.
3. Calcula paso a paso, mostrando el día inicial, cada exclusión y el día final.
4. Considera feriados o suspensiones solo con una fuente que los acredite.
5. Si no tienes un medio de cálculo comprobable para el caso (calendario de feriados acreditado, regla de horas o meses), entrega solo la pauta de cómputo y pide confirmación: un cálculo en lenguaje natural no es determinista.

## Entrega

- Hito, norma y estado.
- Datos usados y datos faltantes.
- Cálculo paso a paso, o la pauta si no se puede calcular con seguridad.
- Riesgos: notificación dudosa, feriado no confirmado, norma modificada recientemente.
- Una advertencia final: la fecha es un cálculo de apoyo que el abogado debe confirmar.
