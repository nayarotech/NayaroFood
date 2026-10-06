import { redirect } from 'next/navigation';

/** Old link; WhatsApp now lives under Notifications. */
export default function WhatsAppPage() {
  redirect('/dashboard/notifications');
}
