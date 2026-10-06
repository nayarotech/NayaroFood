import { TrackLookup } from '@/components/order/track-lookup';

export const metadata = { title: 'Track your order' };

export default function TrackOrderPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Track your order</h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        Enter the tracking code you got when you ordered. You&rsquo;ll see each step live as the
        restaurant updates it.
      </p>
      <TrackLookup />
    </div>
  );
}
