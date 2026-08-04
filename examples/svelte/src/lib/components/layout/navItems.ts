import type { ComponentType } from 'svelte';
import House from 'lucide-svelte/icons/house';
import Code from 'lucide-svelte/icons/code-xml';
import PencilRuler from 'lucide-svelte/icons/pencil-ruler';

/** A primary destination in the app-shell sidebar. */
export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType;
  /** Does `rel` (pathname with the base prefix stripped) belong to this item? */
  match: (rel: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: House, match: (rel) => rel === '/' },
  { href: '/showcase', label: 'API Showcase', icon: Code, match: (rel) => rel.startsWith('/showcase') },
  { href: '/sld', label: 'Live Editor', icon: PencilRuler, match: (rel) => rel.startsWith('/sld') }
];

export const GITHUB_URL = 'https://github.com/adrisanchu/sld-kit';
