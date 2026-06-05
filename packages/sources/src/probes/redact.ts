export function redactSecret(value: string, secret: string): string {
  return value.split(secret).join("<redacted>");
}

export function redactBusTimeUrl(value: string, secret: string): string {
  return redactSecret(value.replace("<YOUR_KEY>", "<redacted>"), secret);
}

export function buildRealtimeUrl(template: string, apiKey: string): string {
  return template.replace("<YOUR_KEY>", encodeURIComponent(apiKey));
}
