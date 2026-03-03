import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAI;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  content: string;
}

const SYSTEM_PROMPT = `Eres "Nerudia", el asistente inteligente de Tiusdei, una plataforma de gestión de tareas y proyectos para equipos de trabajo.
Respondes en español (Ecuador). Eres útil, conciso y profesional.

ALCANCE ESTRICTO — Solo puedes ayudar con temas relacionados a Tiusdei y la gestión del trabajo:
- Analizar, resumir y priorizar tareas, proyectos y sprints
- Sugerir plazos, detectar bloqueos y riesgos
- Responder sobre la carga de trabajo, avance y rendimiento del equipo
- Dar recomendaciones de productividad y organización del trabajo
- Ayudar a redactar descripciones de tareas, entregables o comentarios
- Responder dudas sobre cómo usar Tiusdei

PROHIBIDO — Si el usuario pregunta algo que NO esté relacionado con Tiusdei o la gestión de trabajo (por ejemplo: recetas, chistes, código, clima, noticias, tareas escolares, temas personales, etc.), responde amablemente:
"Lo siento, solo puedo ayudarte con temas relacionados a Tiusdei y la gestión de tu trabajo. ¿En qué puedo asistirte con tus tareas o proyectos?"

Si se te proporciona contexto de tareas o proyectos, úsalo para dar respuestas precisas y accionables.
Responde en formato markdown cuando sea apropiado.`;

// Simple per-user rate limiter
const userLastRequest = new Map<string, number>();
const MIN_REQUEST_INTERVAL_MS = 2000; // 2 seconds between requests per user

export function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const last = userLastRequest.get(userId) || 0;
  const elapsed = now - last;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    return { allowed: false, retryAfterMs: MIN_REQUEST_INTERVAL_MS - elapsed };
  }
  userLastRequest.set(userId, now);
  return { allowed: true, retryAfterMs: 0 };
}

// Retry helper for 429 errors
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = e?.message || e?.statusText || '';
      const is429 = e?.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      if (is429 && attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 15000); // 2s, 4s, 8s max 15s
        console.warn(`[GEMINI] Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Max retries exceeded');
}

export async function chatWithGemini(
  messages: GeminiMessage[],
  additionalContext?: string
): Promise<string> {
  const ai = getGenAI();

  const systemInstructionText = additionalContext
    ? `${SYSTEM_PROMPT}\n\n--- CONTEXTO DE TIUSDEI ---\n${additionalContext}`
    : SYSTEM_PROMPT;

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: { role: 'user' as const, parts: [{ text: systemInstructionText }] },
  });

  // Build chat history (all messages except the last one)
  const historyMessages = messages.slice(0, -1);

  // Gemini requires history to start with 'user' role and alternate roles
  const cleanHistory: typeof historyMessages = [];
  for (const m of historyMessages) {
    if (cleanHistory.length === 0 && m.role === 'model') continue;
    if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === m.role) continue;
    cleanHistory.push(m);
  }
  if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === 'user') {
    cleanHistory.pop();
  }

  const history = cleanHistory.map(m => ({
    role: m.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1];

  return withRetry(async () => {
    try {
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastMessage.content);
      return result.response.text();
    } catch (e: any) {
      // If chat with history fails for non-429 reasons, try without history
      const msg = e?.message || '';
      const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      if (!is429 && history.length > 0) {
        console.warn('[GEMINI] Chat with history failed, retrying without history');
        const chat = model.startChat({});
        const result = await chat.sendMessage(lastMessage.content);
        return result.response.text();
      }
      throw e;
    }
  });
}

export async function summarizeContent(
  content: string,
  type: 'tasks' | 'comments' | 'sprint' | 'general'
): Promise<string> {
  const ai = getGenAI();
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: { role: 'user' as const, parts: [{ text: SYSTEM_PROMPT }] },
  });

  const prompts: Record<string, string> = {
    tasks: 'Resume las siguientes tareas de forma concisa, destacando prioridades, fechas límite próximas y posibles bloqueos:',
    comments: 'Resume los siguientes comentarios de una tarea, destacando las decisiones clave y puntos de acción:',
    sprint: 'Resume el siguiente sprint, incluyendo progreso, tareas completadas, pendientes y riesgos:',
    general: 'Resume el siguiente contenido de forma concisa y útil:',
  };

  const prompt = `${prompts[type] || prompts.general}\n\n${content}`;

  return withRetry(async () => {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return result.response.text();
  });
}

export function buildTaskContext(tasks: { titulo_tarea: string; estado: string; prioridad?: string; fecha_entrega?: string; responsable?: string; mesa?: string }[]): string {
  if (tasks.length === 0) return 'No hay tareas en el contexto actual.';

  const lines = tasks.map((t, i) =>
    `${i + 1}. "${t.titulo_tarea}" — Estado: ${t.estado}${t.prioridad ? `, Prioridad: ${t.prioridad}` : ''}${t.fecha_entrega ? `, Entrega: ${t.fecha_entrega}` : ''}${t.responsable ? `, Responsable: ${t.responsable}` : ''}${(t as any).mesa ? `, Mesa: ${(t as any).mesa}` : ''}`
  );

  return `Tareas actuales (${tasks.length}):\n${lines.join('\n')}`;
}
