# Guion de la demo

Escrito: «Demo: despido por necesidades de la empresa (sintético)». Partes, hechos, fechas y montos ficticios. Todo lo que se dice de una norma en este guion viene de la revisión jurídica del 2026-10-31 contra LeyChile (idNorma 207436) o de la salida de Diké en pantalla; nada más.

Duración objetivo: 3 a 4 minutos. Cifras: decir siempre «en este escrito sintético»; no hay métricas de precisión del motor.

## Escena 1 — Verificar a la fecha de los hechos (30 s)

1. En `/briefs`, «Cargar demo sintético».
2. En «Fecha de referencia (vigencia)», elegir el 15-09-2026, la fecha de la separación del caso (hecho sintético). Decir: «La fecha de referencia la elijo yo, no la app; aquí, la de los hechos. Diké evalúa la vigencia a esa fecha».
3. «Verificar con Diké». En pantalla: 4 de 6 citas detectadas existen y están vigentes al 2026-09-15; «artículo 60» Ambigua; «artículo 640 del Código del Trabajo» No se pudo verificar.
4. Señalar el aviso fijo: Diké revisa solo las citas a normas que detecta; no revisa jurisprudencia ni doctrina, ni si la norma respalda la frase.
5. Señalar el aviso de privacidad: el motor Diké corre en el equipo (con Docker, además, sin red); el agente envía el texto a su proveedor de modelo, que se ve nombrado ahí.

## Escena 2 — El artículo 60 existe, pero no sirve (60 s) — equipo LexO

1. En la tarjeta de «artículo 60», comentar: «esto es el Código del Trabajo. Antes de corregirla, pide al contradictor que revise si el artículo sostiene la frase».
2. El agente responde en la página. Lo esperado:
   - que el contradictor es el mismo modelo con otro rol, no una revisión independiente;
   - el texto del art. 60 CT, con su fuente (LeyChile, idNorma 207436, consultado el 2026-10-31): regula el pago de las remuneraciones adeudadas al fallecer el trabajador;
   - la advertencia: no sostiene la frase del escrito;
   - una propuesta de retirar la cita, o la pregunta por la norma correcta. No propone completar «del Código del Trabajo».
3. Decir: «Si hubiera completado el cuerpo legal, Diké la habría marcado en verde: existe y está vigente. El verde no dice que la norma sirva».
4. Aceptar el retiro. El agente verifica de nuevo: «artículo 60» desaparece; 4 de 5 citas detectadas existen y están vigentes. Si la frase quedó rota, el agente propone una reescritura con «Editar texto»; aplicarla o no es decisión del abogado.

## Escena 3 — Verde no es paráfrasis correcta (30 s)

1. Abrir la tarjeta del art. 168: «Existe y está vigente», con el aviso de que Diké no revisa la paráfrasis.
2. Leer la frase del escrito: «dentro del plazo de treinta días hábiles». Decir: «El art. 168, inciso primero, dice sesenta días hábiles desde la separación. Diké no lo detecta: verifica que el artículo exista y esté vigente, no lo que el escrito dice de él».
3. «Editar texto»: cambiar «treinta días hábiles» por «sesenta días hábiles», guardar y «Verificar con Diké» (la fecha de referencia se mantiene).

## Escena 4 — Lo que Diké no pudo verificar (30 s)

1. En la tarjeta de «artículo 640 del Código del Trabajo»: «No se pudo verificar. Diké no la encontró en su corpus. Eso no prueba que la norma no exista».
2. Preguntar al agente qué hacer. Lo esperado: no afirma que la norma no exista por el rechazo; propone retirarla o pide la norma correcta. Para la demo, no aceptar todavía.

## Escena 5 — Certificado de verificación (45 s)

1. «Emitir certificado de verificación». Aparece el bloqueo: hay 1 cita sin verificar; el certificado será parcial y listará todas las citas.
2. Confirmar «Emitir certificado parcial». El panel muestra: encabezado ámbar «Certificado parcial: 1 cita no verificada», todas las citas con su estado, la fecha de referencia elegida, el corpus `pack_hash` y la huella SHA-256 del texto del escrito, con «El texto actual del escrito coincide con esta huella».
3. Si hay sello: «Sello de integridad». Decir: «El sello prueba que commitment.json no cambió; no cubre certificado.json, que lleva la huella del escrito. La llave es de demostración: no identifica a nadie y no es firma electrónica avanzada de la Ley 19.799. La firma del escrito sigue siendo la del abogado en la Oficina Judicial Virtual».
4. Descargar `certificado.json`, `commitment.json` y el texto verificado, y en una terminal:
   `python3 verifier/verificar_certificado.py certificado.json escrito-verificado.txt commitment.json` → COINCIDE.
   Cambiar una letra del texto y repetir → NO COINCIDE.
5. Cierre: «Diké dice qué normas existen y están vigentes a la fecha que elegí, y deja una huella de este texto en el certificado, fuera del sello. Si la norma sirve, y si la cito bien, lo decido yo».

## Qué no decir

- «Verificado» a secas, «certificado por Diké» o «firmado».
- Que una norma «no existe» porque Diké no pudo verificarla.
- Que el juez o el contradictor son evaluaciones independientes.
- Cifras de precisión.
