'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { ReportCustomerDialog } from '@/components/report-customer-dialog';

export function CustomerReportButton({ customerId, customerName }: { customerId: number; customerName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-ny px-2 py-1 text-xs text-ink-label hover:bg-surface-muted hover:text-danger">
        <Flag aria-hidden className="size-3.5" /> Report
      </button>
      {open && <ReportCustomerDialog customerId={customerId} customerName={customerName} onClose={() => setOpen(false)} />}
    </>
  );
}
