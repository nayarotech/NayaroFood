import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Provider-agnostic WhatsApp transport.
 *
 * Nothing above this interface knows which vendor is in use. Swapping Meta for
 * Twilio means adding an implementation and changing one environment variable —
 * no call site changes. Credentials live only in env and never reach a response.
 */
export interface WhatsAppProvider {
  readonly name: string;
  sendText(to: string, body: string): Promise<ProviderResult>;
}

export interface ProviderResult {
  ok: boolean;
  providerMessageId?: string | undefined;
  error?: string | undefined;
}

/** Development transport: prints the message instead of sending it. */
class LogProvider implements WhatsAppProvider {
  readonly name = 'log';

  async sendText(to: string, body: string): Promise<ProviderResult> {
    logger.info({ to, body }, '[whatsapp:log] message not actually sent');
    return { ok: true, providerMessageId: `log-${Date.now()}` };
  }
}

/** WhatsApp Cloud API. */
class MetaCloudProvider implements WhatsAppProvider {
  readonly name = 'meta';

  async sendText(to: string, body: string): Promise<ProviderResult> {
    const url = `https://graph.facebook.com/${env.WHATSAPP_META_API_VERSION}/${env.WHATSAPP_META_PHONE_NUMBER_ID}/messages`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace('+', ''),
          type: 'text',
          text: { preview_url: false, body },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };

      if (!response.ok) {
        return { ok: false, error: payload.error?.message ?? `HTTP ${response.status}` };
      }
      return { ok: true, providerMessageId: payload.messages?.[0]?.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/** Twilio's WhatsApp channel. */
class TwilioProvider implements WhatsAppProvider {
  readonly name = 'twilio';

  async sendText(to: string, body: string): Promise<ProviderResult> {
    const sid = env.WHATSAPP_TWILIO_ACCOUNT_SID!;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${env.WHATSAPP_TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: env.WHATSAPP_TWILIO_FROM!,
          To: `whatsapp:${to}`,
          Body: body,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!response.ok) return { ok: false, error: payload.message ?? `HTTP ${response.status}` };
      return { ok: true, providerMessageId: payload.sid };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

let cached: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (cached) return cached;
  cached =
    env.WHATSAPP_PROVIDER === 'meta'
      ? new MetaCloudProvider()
      : env.WHATSAPP_PROVIDER === 'twilio'
        ? new TwilioProvider()
        : new LogProvider();
  return cached;
}
