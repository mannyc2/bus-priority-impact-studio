export function routeSliceKey(routeId: string, month: string): string {
  return `${routeId.toLowerCase()}-${month}`;
}
