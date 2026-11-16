// Función serverless de Vercel: conecta la app con Claude (Anthropic)
// Variables de entorno necesarias en Vercel:
//   ANTHROPIC_API_KEY  -> tu clave de Anthropic (obligatoria)
//   APP_PIN            -> un PIN para que solo tú puedas usar la IA (recomendado)
//   ANTHROPIC_MODEL    -> opcional, para cambiar el modelo sin tocar el código

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const TITULOS = [
  'Llega en calma',
  'Escucha para entender, no para responder',
  'Valida y refleja antes de resolver',
  'Pregunta antes de aconsejar',
  'Ten curiosidad, no supongas',
  'Ofrece opciones, no exigencias',
  'No minimices su dolor',
  'No diagnostiques ni des consejos no pedidos',
  'Respeta el silencio, y no lo uses como castigo',
  'Habla desde tus necesidades, no desde el reproche',
  'Cuida lo que te confían',
  'Repara cuando falles',
  'Cuídate a ti también. Presencia con autenticidad'
];

const ACUERDOS = `
1. Llega en calma: antes de responder, revisa desde dónde hablas. Si una parte de ti está ansiosa o quiere arreglar algo, atiéndela primero.
2. Escucha para entender, no para responder.
3. Valida y refleja antes de resolver: no basta con "entiendo", "tiene sentido", "me imagino". Devuélvele lo que escuchaste ("Suena a que te sentiste sola en eso").
4. Pregunta antes de aconsejar: "¿Quieres que te escuche, que te ayude a pensar, o solo que te acompañe?" No eres autoridad.
5. Ten curiosidad, no supongas: "¿Qué significa eso para ti?" vale más que cualquier interpretación.
6. Ofrece opciones, no exigencias: le devuelves el control.
7. No minimices su dolor: nunca "ya pasará", "otros están peor". Mejor "¿Cómo estás hoy con esto?"
8. No diagnostiques ni des consejos no pedidos: no eres su médico, ni su jefe, ni su terapeuta. Eres su compañía.
9. Respeta el silencio, y no lo uses como castigo.
10. Habla desde tus necesidades, no desde el reproche: "Cuando pasa X, me siento Y, porque necesito Z. ¿Estarías dispuesta a…?"
11. Cuida lo que te confían.
12. Repara cuando falles: la confianza crece más con una reparación que con la perfección.
13. Cuídate a ti también. Presencia con autenticidad: conocer tus límites y decirlos con cariño.

Preguntas antes de enviar un mensaje:
1. ¿Esto valida lo que la otra persona siente o solo calma mi incomodidad?
2. ¿Le estoy dando una opción o le estoy exigiendo una respuesta?
3. ¿Si yo recibiera este mensaje, me sentiría visto o presionado?
4. ¿Quién está escribiendo: yo en calma, o una parte mía que tiene una agenda?
`;

const BASE = `Eres un coach experto en Comunicación No Violenta (CNV) y en el modelo de Sistemas de Familia Interna (IFS).
Ayudas a un hombre ecuatoriano (el usuario) a practicar estos 13 acuerdos para crear espacios seguros en sus relaciones:
${ACUERDOS}
Escribes en español de Ecuador, cálido, claro y directo, sin tecnicismos innecesarios.
Eres honesto: no inflas puntajes. Un 9 o 10 es solo para respuestas realmente excelentes.
Si en algún mensaje aparecen señales de riesgo grave (ideas de suicidio, autolesión, violencia), indícalo en el campo "alerta" recomendando con calma buscar ayuda profesional o de emergencia; si no, deja "alerta" vacío.
Responde SIEMPRE y SOLO con un objeto JSON válido, sin texto antes ni después, sin bloques de código.`;

const RELACIONES = {
  hijo: 'su hijo o hija (el usuario es su papá)',
  pareja: 'su pareja o una persona que le gusta y con quien está empezando algo',
  amigo: 'un amigo o amiga cercana',
  familiar: 'un familiar (mamá, hermano/a, primo/a, tío/a…)',
  trabajo: 'un compañero o compañera de trabajo, jefe o subalterno'
};

function enfoqueTxt(enfoque) {
  const n = parseInt(enfoque, 10);
  if (!n || n < 1 || n > 13) {
    return 'MODO LIBRE: no hay un acuerdo de foco. Evalúa con todos los acuerdos y detecta cuáles aplicó bien el usuario y cuáles le faltaron o rompió.';
  }
  return `Pon el foco principal en el acuerdo ${n}: "${TITULOS[n - 1]}". Menciona otros acuerdos solo si es muy importante.`;
}

function corto(s, max) {
  return String(s || '').slice(0, max);
}

function transcript(historial, nombre) {
  return (Array.isArray(historial) ? historial.slice(-24) : [])
    .map(m => (m.rol === 'yo' ? 'Usuario' : (nombre || 'Otra persona')) + ': ' + corto(m.texto, 1500))
    .join('\n');
}

function extraerJSON(texto) {
  const a = texto.indexOf('{');
  const b = texto.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('La IA no devolvió un formato válido. Intenta de nuevo.');
  return JSON.parse(texto.slice(a, b + 1));
}

async function llamarClaude(system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || ('Error ' + r.status);
    throw new Error('Claude: ' + msg);
  }
  const texto = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return extraerJSON(texto);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  if (process.env.APP_PIN && String(body.pin || '') !== String(process.env.APP_PIN)) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en Vercel' });
  }

  const relacion = RELACIONES[body.relacion] || RELACIONES.amigo;
  const enfoque = enfoqueTxt(body.enfoque);
  let user;

  try {
    switch (body.action) {
      case 'start': {
        user = `Crea una situación realista para practicar por WhatsApp.
La otra persona es ${relacion}.
Intensidad emocional: ${corto(body.intensidad, 20) || 'media'}.
Tema: ${corto(body.tema, 300) || 'elige tú algo cotidiano y creíble de la vida en Ecuador'}.
${enfoque} Elige una situación donde valga la pena practicar (en modo libre, una situación variada y cotidiana).
Devuelve este JSON:
{"nombre": "nombre ficticio corto de la otra persona",
 "escenario": "2 a 4 frases SECRETAS: qué le pasa por dentro, qué siente, qué necesita (en términos de CNV) y qué la haría cerrarse",
 "mensaje": "primer mensaje de WhatsApp de esa persona al usuario, natural, 1 a 3 frases, puede tener emojis",
 "alerta": ""}`;
        break;
      }
      case 'turn': {
        user = `Práctica en curso. La otra persona es ${relacion}, se llama ${corto(body.nombre, 40)}.
Escenario secreto (lo que le pasa por dentro): ${corto(body.escenario, 1200)}
${enfoque}

Conversación hasta ahora:
${transcript(body.historial, body.nombre)}

Última respuesta del usuario:
"${corto(body.respuesta, 2000)}"

Tienes dos tareas:
1) Evalúa SOLO la última respuesta del usuario según los acuerdos.
2) Continúa la conversación como ${corto(body.nombre, 40)}, reaccionando de forma realista a lo que el usuario REALMENTE escribió (no a la versión sugerida):
   - si reflejó, validó o preguntó con curiosidad, ábrete un poco más y cuenta algo más profundo;
   - si aconsejó sin que se lo pidieran, minimizó, presionó o habló de sí mismo, responde más corto, cerrado o a la defensiva, como lo haría una persona real.
   Mantén el estilo WhatsApp, 1 a 3 frases. Nunca hables como coach en la voz de la otra persona.
Devuelve este JSON:
{"evaluacion": {
   "puntaje": número del 1 al 10,
   "bien": "1 o 2 frases concretas sobre lo que hizo bien, citando sus palabras",
   "mejorar": "1 o 2 frases: qué acuerdo faltó o se rompió y por qué",
   "sugerencia": "versión mejorada y corta, en el estilo del usuario (informal, ecuatoriano, con sus emojis si los usa)",
   "usados": [números de los acuerdos que aplicó bien en esta respuesta, máximo 4],
   "faltaron": [números de los acuerdos que le faltaron o rompió en esta respuesta, máximo 3]},
 "respuesta_otra": "siguiente mensaje de la otra persona",
 "alerta": ""}`;
        break;
      }
      case 'summary': {
        user = `Terminó una práctica. La otra persona era ${relacion}, se llamaba ${corto(body.nombre, 40)}.
Escenario secreto: ${corto(body.escenario, 1200)}
${enfoque}

Conversación completa:
${transcript(body.historial, body.nombre)}

Haz un cierre breve y útil. Devuelve este JSON:
{"puntaje_global": número del 1 al 10,
 "fortalezas": "2 o 3 frases sobre lo que hizo bien en toda la conversación",
 "a_practicar": "2 o 3 frases sobre el patrón principal a mejorar y cómo",
 "lo_que_sentia": "revela en palabras simples qué le pasaba a la otra persona y si se sintió escuchada",
 "frase": "una frase corta para recordar",
 "usados": [números de los acuerdos que más aplicó en toda la conversación, máximo 4],
 "faltaron": [números de los acuerdos que más le faltaron, máximo 3],
 "alerta": ""}`;
        break;
      }
      case 'real': {
        user = `Situación REAL. El usuario quiere revisar su respuesta antes de enviarla.
Contexto (quién es y qué pasa): ${corto(body.contexto, 800) || 'no indicado'}
${enfoque}

Lo que le dijo la otra persona:
"${corto(body.dijo, 3000)}"

Borrador del usuario:
"${corto(body.borrador, 2000)}"

Revisa el borrador con los acuerdos y las 4 preguntas. Respeta lo que el usuario quiere decir: no cambies su intención ni agregues cosas que él no diría. Si el borrador ya está muy bien, dilo y sugiere cambios mínimos.
Devuelve este JSON:
{"puntaje": número del 1 al 10,
 "preguntas": ["respuesta breve a la pregunta 1", "a la 2", "a la 3", "a la 4"],
 "parte": "observación amable y tentativa, en lenguaje de partes de IFS, sobre desde dónde parece estar escribiendo (calma/Self, o una parte ansiosa, complaciente, rescatadora, controladora…), sin diagnosticar",
 "bien": "1 o 2 frases sobre lo que está bien",
 "mejorar": "1 o 2 frases sobre qué mejorar y por qué",
 "sugerencia": "versión mejorada lista para enviar, con la voz y el estilo del usuario",
 "usados": [números de los acuerdos que aplica bien el borrador, máximo 4],
 "faltaron": [números de los acuerdos que le faltan o rompe el borrador, máximo 3],
 "alerta": ""}`;
        break;
      }
      default:
        return res.status(400).json({ error: 'Acción no válida' });
    }

    const out = await llamarClaude(BASE, user);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error inesperado' });
  }
};
