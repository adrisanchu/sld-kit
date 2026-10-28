/** The element under the pointer, as reported by `SldCanvas`'s `elementhover` event. */
export interface ElementHover {
  id: string;
  kind: 'position' | 'busbar' | 'connection';
}
