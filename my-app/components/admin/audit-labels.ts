/** Human wording for audit-log action codes. Unknown codes fall back to the code itself. */
const LABELS: Record<string, string> = {
  'restaurant.verified': 'Verified the restaurant',
  'restaurant.blocked': 'Blocked the restaurant',
  'restaurant.unblocked': 'Unblocked the restaurant',
  'restaurant.deactivated': 'Deactivated the restaurant',
  'restaurant.reactivated': 'Reactivated the restaurant',
  'restaurant.returned_to_review': 'Returned to review',
  'order.status_override': 'Changed an order status',
  'ranking.adjust': 'Adjusted ranking',
  'ranking.reorder': 'Re-ordered pinned restaurants',
  'ranking.recompute': 'Recomputed all ranking scores',
};

export function describeAction(action: string): string {
  if (LABELS[action]) return LABELS[action];
  // Legacy codes, e.g. "restaurant.status.ACTIVE".
  const legacy = /^restaurant\.status\.(\w+)$/.exec(action);
  if (legacy) return `Set status to ${legacy[1]!.toLowerCase()}`;
  return action;
}

export const ACTION_FILTERS = [
  { value: '', label: 'All activity' },
  { value: 'restaurant.', label: 'Restaurant status' },
  { value: 'order.', label: 'Order overrides' },
  { value: 'ranking.', label: 'Ranking' },
];
