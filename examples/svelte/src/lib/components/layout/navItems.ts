import type { ComponentType } from 'svelte';
import Zap from 'lucide-svelte/icons/zap';
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
  { href: '/showcase', label: 'API Showcase', icon: Code, match: (rel) => rel.startsWith('/showcase') },
  { href: '/sld', label: 'Live Editor', icon: PencilRuler, match: (rel) => rel.startsWith('/sld') },
  { href: '/power-flow', label: 'Power Flow', icon: Zap, match: (rel) => rel.startsWith('/power-flow') }
];

export const GITHUB_URL = 'https://github.com/adrisanchu/sld-kit';
