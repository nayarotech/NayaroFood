import { apiGet, apiPost } from '@/lib/api';

/**
 * Browser-side push registration.
 *
 * Three things have to line up: a registered service worker, notification
 * permission, and a subscription tied to our VAPID public key. Any of them can
 * be missing or revoked at any time, so every step is checked rather than assumed.
 */

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  // VAPID keys are base64url; atob needs standard base64 with padding.
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function currentState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return 'off';
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

function subscribe(registration: ServiceWorkerRegistration, serverKey: Uint8Array): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    // Chrome requires this; a silent push is not permitted.
    userVisibleOnly: true,
    applicationServerKey: serverKey as BufferSource,
  });
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
}

/** "Registration failed - push service error" is an AbortError from the browser. */
function isPushServiceError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || /push service/i.test(error.message));
}

async function isBrave(): Promise<boolean> {
  const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
  try {
    return Boolean(await brave?.isBrave?.());
  } catch {
    return false;
  }
}

/**
 * Turn the browser's terse push errors into something a restaurant owner can
 * act on. These come from the browser's own push service, not from our API.
 */
async function explainPushError(error: unknown): Promise<string> {
  if (isPushServiceError(error)) {
    if (await isBrave()) {
      return 'Brave blocks phone & desktop alerts by default. Open brave://settings/privacy, turn on “Use Google services for push messaging”, restart Brave, then try again.';
    }
    return 'Your browser couldn’t reach its notification service. Turn off any VPN, ad-blocker or firewall that blocks Google services and try again — or use Chrome, Edge, Firefox or Safari.';
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.';
  }
  if (error instanceof DOMException && error.name === 'InvalidStateError') {
    return 'This browser is in a mode that doesn’t support alerts (for example a private window). Open the dashboard in a normal window.';
  }
  return error instanceof Error ? error.message : 'Could not turn on alerts.';
}

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const registration = (await registerWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;

  const { publicKey, enabled } = await apiGet<{ publicKey: string | null; enabled: boolean }>(
    '/restaurant/push/key',
  );
  if (!enabled || !publicKey) throw new Error('Push is not configured on the server.');

  const serverKey = urlBase64ToUint8Array(publicKey);
  let subscription = await registration.pushManager.getSubscription();

  // A subscription made with an older server key looks fine but can never
  // receive our pushes — replace it rather than silently reusing it.
  if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
  }

  if (!subscription) {
    try {
      subscription = await subscribe(registration, serverKey);
    } catch (error) {
      // One retry after clearing state: a half-finished earlier attempt can
      // leave the browser's push registration wedged.
      if (isPushServiceError(error)) {
        await (await registration.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
        try {
          subscription = await subscribe(registration, serverKey);
        } catch (retryError) {
          throw new Error(await explainPushError(retryError));
        }
      } else {
        throw new Error(await explainPushError(error));
      }
    }
  }

  const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
  await apiPost('/restaurant/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  });

  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await apiPost('/restaurant/push/unsubscribe', { endpoint: subscription.endpoint }).catch(
      () => undefined,
    );
    await subscription.unsubscribe();
  }
  return 'off';
}

export async function sendTestPush(): Promise<void> {
  await apiPost('/restaurant/push/test', {});
}
