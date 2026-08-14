import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_PAY_CHANNEL_ID = Deno.env.get('LINE_PAY_CHANNEL_ID')!;
const LINE_PAY_CHANNEL_SECRET = Deno.env.get('LINE_PAY_CHANNEL_SECRET')!;
const LINE_PAY_API = Deno.env.get('LINE_PAY_SANDBOX') === 'true'
  ? 'https://sandbox-api-pay.line.me'
  : 'https://api-pay.line.me';
const SITE_URL = Deno.env.get('SITE_URL')!;

async function sign(secret: string, uri: string, body: string, nonce: string): Promise<string> {
  const msg = `${secret}${uri}${body}${nonce}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const {
      line_user_id, line_display_name, items, total_amount,
      shipping_name, shipping_phone, shipping_address,
    } = await req.json();

    // 建立訂單
    const { data: order, error: orderErr } = await supabase.from('orders').insert({
      line_user_id, line_display_name, items, total_amount,
      shipping_name, shipping_phone, shipping_address, status: 'pending',
    }).select().single();
    if (orderErr) throw new Error(orderErr.message);

    // 原子性扣減庫存
    for (const item of items) {
      const { error: stockErr } = await supabase.rpc('decrement_stock', {
        product_id: item.id, qty: item.qty,
      });
      if (stockErr) {
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error(`庫存不足：${item.name}`);
      }
    }

    // LINE Pay 請求付款
    const uri = '/v3/payments/request';
    const nonce = crypto.randomUUID();
    const body = JSON.stringify({
      amount: total_amount,
      currency: 'TWD',
      orderId: order.id,
      packages: [{
        id: 'pkg1',
        amount: total_amount,
        products: items.map((i: { name: string; qty: number; price: number }) => ({
          name: i.name, quantity: i.qty, price: i.price,
        })),
      }],
      redirectUrls: {
        confirmUrl: `${SITE_URL}/?page=order-confirm`,
        cancelUrl: `${SITE_URL}/?page=cart`,
      },
    });

    const signature = await sign(LINE_PAY_CHANNEL_SECRET, uri, body, nonce);

    const payResp = await fetch(`${LINE_PAY_API}${uri}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LINE-Pay-Channel-Id': LINE_PAY_CHANNEL_ID,
        'X-LINE-Pay-Channel-Secret': LINE_PAY_CHANNEL_SECRET,
        'X-LINE-Pay-Merchant-Region': 'TW',
        'X-LINE-Pay-Nonce': nonce,
        'X-LINE-Pay-Signature': signature,
      },
      body,
    });

    const payResult = await payResp.json();
    if (payResult.returnCode !== '0000') {
      await supabase.from('orders').delete().eq('id', order.id);
      throw new Error(`LINE Pay 錯誤：${payResult.returnMessage}`);
    }

    return new Response(JSON.stringify({
      orderId: order.id,
      paymentUrl: payResult.info.paymentUrl.web,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
