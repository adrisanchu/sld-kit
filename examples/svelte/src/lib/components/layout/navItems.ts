import type { ComponentType } from 'svelte';
import Zap from 'lucide-svelte/icons/zap';
import Code from 'lucide-svelte/icons/code-xml';
import PencilRuler from 'lucide-svelte/icons/pencil-ruler';
import Boxes from 'lucide-svelte/icons/boxes';

/** A primary destination in the app-shell sidebar. */
export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType;
  /** Does `rel` (pathname with the base prefix stripped) belong to this item? */
  match: (rel: string) => boolean;
  /** A separately built app on the same site (full page load, outside the SvelteKit router). */
  external?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/showcase', label: 'API Showcase', icon: Code, match: (rel) => rel.startsWith('/showcase') },
  { href: '/sld', label: 'Live Editor', icon: PencilRuler, match: (rel) => rel.startsWith('/sld') },
  { href: '/power-flow', label: 'Power Flow', icon: Zap, match: (rel) => rel.startsWith('/power-flow') },
  // React build merged in by deploy-pages.yml until #54 makes it a native route.
  { href: '/box/', label: 'Box view', icon: Boxes, external: true, match: () => false }
];

export const GITHUB_URL = 'https://github.com/adrisanchu/sld-kit';
