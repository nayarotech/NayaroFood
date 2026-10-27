'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OpeningPeriod } from '@nayaro/shared';
import { ApiError, apiPatch } from '@/lib/api';

export interface HoursSettings {
  timezone: string | null;
  weeklyHours: OpeningPeriod[] | null;
  holidayClosures: string[] | null;
  schedulingEnabled: number | null;
  maxOrdersPerSlot: number | null;
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const input = 'rounded-ny border border-line bg-surface px-3 py-2 text-sm';

export function HoursSettingsCard({ settings }: { settings: HoursSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.weeklyHours !== null);
  const [periods, setPeriods] = useState<OpeningPeriod[]>(settings.weeklyHours ?? DAYS.map((_, day) => ({ day, opens: '09:00', closes: '21:00' })));
  const [timezone, setTimezone] = useState(settings.timezone ?? 'Asia/Kathmandu');
  const [holidays, setHolidays] = useState((settings.holidayClosures ?? []).join('\n'));
  const [scheduling, setScheduling] = useState(settings.schedulingEnabled === 1);
  const [limit, setLimit] = useState(settings.maxOrdersPerSlot ?? 10);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      await apiPatch('/restaurant/settings', { timezone, weeklyHours: enabled ? periods : null, holidayClosures: [...new Set(holidays.split(/[\s,]+/).filter(Boolean))], schedulingEnabled: scheduling, maxOrdersPerSlot: limit });
      setNotice({ error: false, text: 'Hours and scheduling saved. Existing scheduled orders keep their confirmed times.' });
      router.refresh();
    } catch (error) {
      setNotice({ error: true, text: error instanceof ApiError ? `${error.message} ${Object.values(error.fields ?? {}).join(' ')}` : 'Could not save hours.' });
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-ny-card border border-line bg-surface p-5">
      <h2 className="font-display text-base font-semibold">Hours and scheduled orders</h2>
      <p className="mt-1 text-sm text-ink-muted">Automatic opening hours use your restaurant timezone. Manual closure and order pause switches stop all new orders.</p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="block text-sm">Timezone
          <input required maxLength={64} value={timezone} onChange={(e) => setTimezone(e.target.value)} className={`${input} mt-1 block w-full`} placeholder="Asia/Kathmandu" />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Use weekly opening hours</label>
        {enabled && <div className="space-y-3">{DAYS.map((day, dayIndex) => (
          <fieldset key={day} className="rounded-ny border border-line p-3">
            <legend className="px-1 text-sm font-medium">{day}</legend>
            {!periods.some((p) => p.day === dayIndex) && <span className="text-sm text-ink-muted">Closed</span>}
            {periods.map((period, index) => period.day !== dayIndex ? null : (
              <div key={index} className="mb-2 flex flex-wrap items-center gap-2">
                <input aria-label={`${day} opening time`} type="time" required value={period.opens} onChange={(e) => setPeriods(periods.map((p, i) => i === index ? { ...p, opens: e.target.value } : p))} className={input} />
                <span className="text-sm">to</span>
                <input aria-label={`${day} closing time (24:00 for midnight)`} required pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="21:00" value={period.closes} onChange={(e) => setPeriods(periods.map((p, i) => i === index ? { ...p, closes: e.target.value } : p))} className={`${input} w-28`} />
                <button type="button" onClick={() => setPeriods(periods.filter((_, i) => i !== index))} className="text-sm text-danger">Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => setPeriods([...periods, { day: dayIndex, opens: '09:00', closes: '21:00' }])} className="ml-2 text-sm text-accent-label">Add period</button>
          </fieldset>
        ))}<p className="text-xs text-ink-muted">Use 24:00 to close at midnight. Split overnight hours across two days.</p></div>}
        <label className="block text-sm">Holiday closures (YYYY-MM-DD, one per line)
          <textarea rows={3} value={holidays} onChange={(e) => setHolidays(e.target.value)} className={`${input} mt-1 block w-full`} />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scheduling} onChange={(e) => setScheduling(e.target.checked)} /> Allow scheduled orders up to seven days ahead</label>
        {scheduling && <label className="block text-sm">Maximum orders per 15-minute dispatch slot
          <input type="number" min={1} max={100} required value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={`${input} ml-2 w-24`} />
        </label>}
        <p className="text-xs text-ink-muted">Slots allow your configured preparation time. Customers choose when food should be ready for dispatch; delivery follows.</p>
        {notice && <p role="status" className={`text-sm ${notice.error ? 'text-danger' : 'text-success'}`}>{notice.text}</p>}
        <button disabled={busy} className="rounded-ny bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">{busy ? 'Saving…' : 'Save hours and scheduling'}</button>
      </form>
    </section>
  );
}
