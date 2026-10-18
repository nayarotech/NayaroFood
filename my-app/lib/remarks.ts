/** Why a customer was reported. Shared by server pages and client dialogs. */
export const REMARK_REASONS: { value: string; label: string }[] = [
  { value: 'NOT_REACHABLE', label: 'Didn’t answer the phone' },
  { value: 'CANCELLED_LATE', label: 'Cancelled at the last moment' },
  { value: 'REFUSED_DELIVERY', label: 'Refused the delivery' },
  { value: 'WRONG_ADDRESS', label: 'Wrong or fake address' },
  { value: 'FAKE_ORDER', label: 'Fake order' },
  { value: 'ABUSIVE', label: 'Abusive behaviour' },
  { value: 'OTHER', label: 'Other' },
];

export const remarkLabel = (reason: string): string =>
  REMARK_REASONS.find((r) => r.value === reason)?.label ?? reason;
