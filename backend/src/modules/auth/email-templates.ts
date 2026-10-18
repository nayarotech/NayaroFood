import { env } from '../../config/env.js';
import { escapeHtml } from '../../lib/email.js';

type Purpose = 'SIGNUP' | 'PASSWORD_RESET';

const COPY: Record<Purpose, { subject: string; heading: string; lead: string }> = {
  SIGNUP: {
    subject: 'Your Nayaro Food sign-up code',
    heading: 'Confirm your email',
    lead: 'Enter this code to finish creating your Nayaro Food account.',
  },
  PASSWORD_RESET: {
    subject: 'Reset your Nayaro Food password',
    heading: 'Reset your password',
    lead: 'Enter this code to choose a new password.',
  },
};

/**
 * The code email. Table-based, inline-styled HTML because email clients
 * ignore stylesheets; a plain-text twin for clients that don't render HTML.
 */
export function codeEmail(purpose: Purpose, code: string, minutes: number, name?: string) {
  const copy = COPY[purpose];
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi,';
  const spaced = code.split('').join(' ');
  const site = env.APP_PUBLIC_URL.replace(/\/+$/, '');

  const text = [
    greeting,
    '',
    copy.lead,
    '',
    `    ${code}`,
    '',
    `The code expires in ${minutes} minutes. If you didn’t ask for it, you can ignore this email — nothing will change.`,
    '',
    '— Nayaro Food',
    site,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111726;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e7ec;border-radius:10px;">
        <tr><td style="padding:28px 28px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:28px;height:28px;background:#1f5eff;border-radius:6px;color:#ffffff;font-weight:700;font-size:14px;text-align:center;line-height:28px;">N</td>
            <td style="padding-left:8px;font-weight:600;font-size:15px;">Nayaro Food</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 28px 0;">
          <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;">${escapeHtml(copy.heading)}</h1>
          <p style="margin:0 0 4px;font-size:15px;line-height:1.5;color:#4b5565;">${escapeHtml(greeting)}</p>
          <p style="margin:0;font-size:15px;line-height:1.5;color:#4b5565;">${escapeHtml(copy.lead)}</p>
        </td></tr>
        <tr><td style="padding:20px 28px;">
          <div style="background:#f3f4f6;border-radius:6px;padding:16px;text-align:center;font-size:30px;font-weight:700;letter-spacing:6px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;color:#111726;">${escapeHtml(spaced)}</div>
          <p style="margin:12px 0 0;font-size:13px;color:#737c8c;">This code expires in ${minutes} minutes.</p>
        </td></tr>
        <tr><td style="padding:0 28px 28px;">
          <p style="margin:0;font-size:13px;line-height:1.5;color:#737c8c;">If you didn’t ask for this, ignore this email — nothing will change. Never share this code; Nayaro will never ask for it.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#737c8c;"><a href="${escapeHtml(site)}" style="color:#737c8c;">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a></p>
    </td></tr>
  </table>
</body></html>`;

  return { subject: copy.subject, html, text };
}
