/**
 * Layout base unificado para todos los emails de Tiusdei.
 *
 * Garantiza:
 *  - Header con logo dinámico desde site_settings
 *  - Tipografía y paleta consistentes (azul Tiusdei #2563eb, rojo urgente, etc.)
 *  - Botón CTA estandarizado
 *  - Footer con marca dinámica
 *  - Mobile-friendly (max-width 600px, font-size cómodos)
 *  - Versión plain text autogenerada
 *  - Compatible con dark-mode de clientes que respetan color-scheme
 */

import { query } from '../db/mysql.js';

const DEFAULT_LOGO_URL = 'https://tiusdei.qbit.ec/uploads/tiusdei-logo.png';
const DEFAULT_FOOTER = 'Tiusdei Portal · Notificación automática';
const DEFAULT_SITE_NAME = 'Tiusdei';
const DEFAULT_FRONTEND = 'https://tiusdei.qbit.ec';

export interface EmailBranding {
  logoUrl: string;
  siteName: string;
  footerText: string;
  frontendUrl: string;
}

let _brandingCache: { value: EmailBranding; expiresAt: number } | null = null;

/** Lee branding desde site_settings con cache de 5 minutos. */
export async function getEmailBrandingV2(): Promise<EmailBranding> {
  if (_brandingCache && _brandingCache.expiresAt > Date.now()) {
    return _brandingCache.value;
  }
  const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND;
  let branding: EmailBranding = {
    logoUrl: DEFAULT_LOGO_URL,
    siteName: DEFAULT_SITE_NAME,
    footerText: DEFAULT_FOOTER,
    frontendUrl,
  };
  try {
    const rows = await query<{ key: string; value: string | null }[]>('SELECT `key`, value FROM site_settings');
    const map: Record<string, string | null> = {};
    for (const r of rows) map[r.key] = r.value;
    const logoEmailUrl = map.logo_email_url;
    const isValidLogo = logoEmailUrl && /^https?:\/\//.test(logoEmailUrl) && !logoEmailUrl.includes('drive.google.com');
    branding = {
      logoUrl: isValidLogo ? logoEmailUrl : DEFAULT_LOGO_URL,
      siteName: map.site_name || DEFAULT_SITE_NAME,
      footerText: map.email_footer_text || DEFAULT_FOOTER,
      frontendUrl,
    };
  } catch {
    /* fallback al default */
  }
  _brandingCache = { value: branding, expiresAt: Date.now() + 5 * 60 * 1000 };
  return branding;
}

/** Limpiar cache (útil para tests o cuando admin cambia settings). */
export function invalidateBrandingCache(): void {
  _brandingCache = null;
}

// ========== Tipos del layout ==========

export type AccentColor = 'blue' | 'red' | 'amber' | 'green' | 'purple';

const ACCENTS: Record<AccentColor, { primary: string; bg: string; border: string }> = {
  blue:   { primary: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  red:    { primary: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  amber:  { primary: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  green:  { primary: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  purple: { primary: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
};

export interface EmailLayoutInput {
  /** Color de acento (header subtítulo, botón). Default: blue. */
  accent?: AccentColor;
  /** Texto pequeño que aparece sobre el headline (ej. "Nueva tarea asignada"). */
  preheader: string;
  /** Headline grande (ej. nombre de la tarea). */
  headline: string;
  /** Saludo (ej. "Hola Steven,"). */
  greeting?: string;
  /** Párrafo principal — texto plano o HTML simple permitido. */
  intro: string;
  /** Tabla opcional de datos (clave-valor). */
  details?: Array<{ label: string; value: string; highlight?: boolean }>;
  /** Cita destacada (ej. el texto del comentario). */
  quote?: string;
  /** Lista con título (ej. los acuerdos de una minuta), después del párrafo principal. */
  lista?: { titulo: string; items: string[] };
  /** Botón principal. */
  cta: { text: string; url: string };
  /** Botón secundario opcional. */
  secondaryCta?: { text: string; url: string };
  /** Mensaje al final del cuerpo. */
  footer?: string;
}

/** Genera HTML completo + plain text. */
export async function renderEmail(input: EmailLayoutInput): Promise<{ html: string; text: string }> {
  const branding = await getEmailBrandingV2();
  const accent = ACCENTS[input.accent || 'blue'];

  const detailsRows = (input.details || [])
    .map((d) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;font-weight:500;width:140px;vertical-align:top;">${escapeHtml(d.label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111;${d.highlight ? 'font-weight:700;' : ''}">${d.value}</td>
      </tr>`)
    .join('');

  const detailsTable = detailsRows
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:20px 0;">${detailsRows}</table>`
    : '';

  const quoteBlock = input.quote
    ? `<div style="background:#f9fafb;border-left:4px solid ${accent.primary};padding:14px 16px;border-radius:4px;margin:20px 0;font-size:14px;color:#374151;font-style:italic;line-height:1.5;">"${escapeHtml(input.quote)}"</div>`
    : '';

  const listaBlock = input.lista && input.lista.items.length
    ? `<p style="margin:16px 0 6px;font-size:14px;font-weight:600;color:#111;">${escapeHtml(input.lista.titulo)}</p>
       <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#374151;line-height:1.6;">${input.lista.items.map((i) => `<li style="margin:0 0 4px;">${escapeHtml(i)}</li>`).join('')}</ul>`
    : '';

  const greetingBlock = input.greeting
    ? `<p style="margin:0 0 12px;font-size:15px;color:#111;">${escapeHtml(input.greeting)}</p>`
    : '';

  const secondaryBtn = input.secondaryCta
    ? `<a href="${input.secondaryCta.url}" style="display:inline-block;margin-left:8px;color:${accent.primary};padding:12px 18px;text-decoration:none;font-weight:500;font-size:14px;">${escapeHtml(input.secondaryCta.text)}</a>`
    : '';

  const closingBlock = input.footer
    ? `<p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">${input.footer}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(branding.siteName)}</title>
    <!--[if mso]><style>body,table,td{font-family:Arial,sans-serif !important;}</style><![endif]-->
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;-webkit-font-smoothing:antialiased;">
    <!-- Preheader (texto invisible que algunos clientes muestran como preview) -->
    <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f3f4f6;">${escapeHtml(input.preheader)}</div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <!-- Header -->
            <tr>
              <td style="padding:24px 32px 20px;border-bottom:1px solid #e5e7eb;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${branding.logoUrl}" alt="${escapeHtml(branding.siteName)}" width="44" height="44" style="display:block;max-width:44px;height:auto;border:0;outline:none;text-decoration:none;" />
                    </td>
                    <td style="vertical-align:middle;padding-left:12px;">
                      <div style="font-size:11px;color:${accent.primary};font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(input.preheader)}</div>
                      <div style="font-size:18px;color:#111;font-weight:700;line-height:1.3;margin-top:2px;">${escapeHtml(input.headline)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:24px 32px;">
                ${greetingBlock}
                <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">${input.intro}</p>
                ${listaBlock}
                ${quoteBlock}
                ${detailsTable}
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 4px;">
                  <tr>
                    <td>
                      <a href="${input.cta.url}" style="display:inline-block;background:${accent.primary};color:#ffffff;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;line-height:1;">${escapeHtml(input.cta.text)}</a>
                      ${secondaryBtn}
                    </td>
                  </tr>
                </table>
                ${closingBlock}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:18px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6b7280;">
                ${escapeHtml(branding.footerText)}<br>
                <a href="${branding.frontendUrl}" style="color:#6b7280;text-decoration:underline;">${branding.frontendUrl.replace(/^https?:\/\//, '')}</a>
              </td>
            </tr>
          </table>
          <div style="font-size:11px;color:#9ca3af;margin-top:12px;">Recibiste este correo porque eres usuario de ${escapeHtml(branding.siteName)}.</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  // Plain text version
  const lines: string[] = [];
  lines.push(`[${branding.siteName}] ${input.preheader}`);
  lines.push('');
  lines.push(input.headline);
  lines.push('='.repeat(Math.min(input.headline.length, 60)));
  lines.push('');
  if (input.greeting) lines.push(input.greeting);
  lines.push(stripHtml(input.intro));
  lines.push('');
  if (input.lista && input.lista.items.length) {
    lines.push(input.lista.titulo);
    for (const i of input.lista.items) lines.push(`- ${i}`);
    lines.push('');
  }
  if (input.quote) {
    lines.push(`> "${input.quote}"`);
    lines.push('');
  }
  if (input.details && input.details.length > 0) {
    for (const d of input.details) {
      lines.push(`  ${d.label}: ${stripHtml(d.value)}`);
    }
    lines.push('');
  }
  lines.push(`${input.cta.text}: ${input.cta.url}`);
  if (input.secondaryCta) {
    lines.push(`${input.secondaryCta.text}: ${input.secondaryCta.url}`);
  }
  if (input.footer) {
    lines.push('');
    lines.push(stripHtml(input.footer));
  }
  lines.push('');
  lines.push('--');
  lines.push(branding.footerText);
  lines.push(branding.frontendUrl);

  return { html, text: lines.join('\n') };
}

// ========== Utilidades ==========

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(s: string): string {
  return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
