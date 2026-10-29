import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_TOKEN      = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;
const LINE_SECRET     = Deno.env.get('LINE_CHANNEL_SECRET') ?? '';
const LIFF_ID         = Deno.env.get('LIFF_ID') ?? '2011087277-ZAvzmEyd';
const SHOP_URL        = `https://liff.line.me/${LIFF_ID}`;

async function verifySignature(body: string, sig: string | null): Promise<boolean> {
  if (!LINE_SECRET || !sig) return true; // skip if secret not configured
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(LINE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return b64 === sig;
}

async function replyLine(replyToken: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
}

async function getLineProfile(userId: string) {
  const r = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { 'Authorization': `Bearer ${LINE_TOKEN}` },
  });
  return r.ok ? await r.json() : null;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.text();
  const sig  = req.headers.get('x-line-signature');

  if (!(await verifySignature(body, sig))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { events } = JSON.parse(body);

  for (const event of events ?? []) {
    const userId = event.source?.userId;
    if (!userId) continue;

    if (event.type === 'follow') {
      const profile = await getLineProfile(userId);
      await supabase.from('members').upsert({
        line_user_id: userId,
        display_name: profile?.displayName ?? null,
        avatar_url:   profile?.pictureUrl   ?? null,
      }, { onConflict: 'line_user_id' });

      await replyLine(event.replyToken,
        `歡迎加入 DAZSU！🏍️\n\n` +
        `您的會員資料已自動建立，之後下單購買不需要另外填寫會員表單。\n\n` +
        `👉 立即逛商店：\n${SHOP_URL}`,
      );
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text as string).trim();
      const lower = text.toLowerCase();
      if (lower.includes('購物') || lower.includes('商店') || lower.includes('買') || lower === 'shop') {
        await replyLine(event.replyToken,
          `DAZSU 選品店 🛍️\n\n點擊下方連結即可購物：\n${SHOP_URL}`,
        );
      } else if (lower.includes('訂單') || lower.includes('order')) {
        await replyLine(event.replyToken,
          `查詢訂單記錄：\n${SHOP_URL}?page=orders`,
        );
      }
    }
  }

  return new Response('OK', { status: 200 });
});
