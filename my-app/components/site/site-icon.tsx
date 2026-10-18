import { Bike, Clock, Heart, Leaf, MapPin, Phone, ShieldCheck, ShoppingBag, Star, Store, UtensilsCrossed, Wallet, type LucideIcon } from 'lucide-react';

/** Named icons the admin can pick for homepage feature cards. */
export const SITE_ICON_MAP: Record<string, { icon: LucideIcon; label: string }> = {
  'map-pin': { icon: MapPin, label: 'Location' },
  wallet: { icon: Wallet, label: 'Wallet / cash' },
  bike: { icon: Bike, label: 'Delivery' },
  clock: { icon: Clock, label: 'Time' },
  star: { icon: Star, label: 'Star' },
  shield: { icon: ShieldCheck, label: 'Safety' },
  utensils: { icon: UtensilsCrossed, label: 'Food' },
  phone: { icon: Phone, label: 'Phone' },
  bag: { icon: ShoppingBag, label: 'Order' },
  store: { icon: Store, label: 'Restaurant' },
  heart: { icon: Heart, label: 'Favourite' },
  leaf: { icon: Leaf, label: 'Fresh' },
};

export function SiteIcon({ name, className }: { name: string; className?: string }) {
  const entry = SITE_ICON_MAP[name];
  if (entry) {
    const Icon = entry.icon;
    return <Icon aria-hidden className={className} strokeWidth={1.75} />;
  }
  // Content saved before named icons existed may hold an emoji or text.
  return name ? <span aria-hidden>{name}</span> : null;
}
