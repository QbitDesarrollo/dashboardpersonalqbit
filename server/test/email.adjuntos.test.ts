import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('sendEmail · adjuntos y copia', () => {
  it('por Mailgun manda el PDF adjunto y las personas en copia', async () => {
    vi.stubEnv('MAILGUN_API_KEY', 'key-prueba');
    vi.stubEnv('MAILGUN_DOMAIN', 'mg.prueba.local');
    const fetchFalso = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const { sendEmail } = await import('../src/services/email.js');

    const ok = await sendEmail({
      to: 'ana@qbit.ec', cc: 'diego@qbit.ec, even@qbit.ec', subject: 'Reporte', html: '<p>Hola</p>',
      attachments: [{ filename: 'Reporte.pdf', content: Buffer.from('%PDF-1.3 prueba'), contentType: 'application/pdf' }],
    });

    expect(ok).toBe(true);
    const cuerpo = fetchFalso.mock.calls[0][1].body as FormData;
    expect(cuerpo).toBeInstanceOf(FormData);
    expect(cuerpo.get('to')).toBe('ana@qbit.ec');
    expect(cuerpo.get('cc')).toBe('diego@qbit.ec, even@qbit.ec');
    const adjunto = cuerpo.get('attachment') as File;
    expect(adjunto.name).toBe('Reporte.pdf');
    expect(Buffer.from(await adjunto.arrayBuffer()).toString()).toBe('%PDF-1.3 prueba');
  });

  it('sin adjuntos ni copia sigue enviando como siempre', async () => {
    vi.stubEnv('MAILGUN_API_KEY', 'key-prueba');
    vi.stubEnv('MAILGUN_DOMAIN', 'mg.prueba.local');
    const fetchFalso = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const { sendEmail } = await import('../src/services/email.js');
    await sendEmail({ to: 'ana@qbit.ec', subject: 'Hola', html: '<p>Hola</p>' });
    const cuerpo = new URLSearchParams(String(fetchFalso.mock.calls[0][1].body));
    expect(cuerpo.get('to')).toBe('ana@qbit.ec');
    expect(cuerpo.get('cc')).toBeNull();
  });
});
