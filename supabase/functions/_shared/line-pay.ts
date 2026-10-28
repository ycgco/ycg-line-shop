export const LINE_PAY_BASE = {
  sandbox: 'https://sandbox-api-pay.line.me',
  prod:    'https://api-pay.line.me',
};

export async function linePayHeaders(
  channelId: string,
  channelSecret: string,
  uri: string,
  body: string,
): Promise<Record<string, string>> {
  const nonce   = crypto.randomUUID();
  const message = `${channelSecret}\n${uri}\n${body}\n${nonce}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return {
    'Content-Type':               'application/json',
    'X-LINE-ChannelId':           channelId,
    'X-LINE-Authorization-Nonce': nonce,
    'X-LINE-Authorization':       b64,
  };
}
