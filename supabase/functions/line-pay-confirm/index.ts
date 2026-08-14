import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_PAY_CHANNEL_ID = Deno.env.get('LINE_PAY_CHANNEL_ID')!;
const LINE_PAY_CHANNEL_SECRET = Deno.env.get('LINE_PAY_CHANNEL_SECRET')!;
const LINE_PAY_API = Deno.env.get('LINE_PAY_SANDBOX') === 'true'
  ? 'https://sandbox-api-pay.line.me'
  : 'https://api-pay.line.me';

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
    const { orderId, transactionId } = await req.json();

    const { data: order, error: orderErr } = await supabase
      .from('orders').select('*').eq('id', orderId).single();
    if (orderErr || !order) throw new Error('找不到訂單');
    if (order.status !== 'pending') throw new Error('此訂單已處理過');

    const uri = `/v3/payments/${transactionId}/confirm`;
    const nonce = crypto.randomUUID();
    const body = JSON.stringify({ amount: order.total_amount, currency: 'TWD' });
    const signature = await sign(LINE_PAY_CHANNEL_SECRET, uri, body, nonce);

    const confirmResp = await fetch(`${LINE_PAY_API}${uri}`, {
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

    const result = await confirmResp.json();
    if (result.returnCode !== '0000') {
      throw new Error(`LINE Pay 確認失敗：${result.returnMessage}`);
    }

    await supabase.from('orders').update({
      status: 'paid',
      line_pay_transaction_id: String(transactionId),
    }).eq('id', orderId);

    await supabase.rpc('increment_member_spent', {
      uid: order.line_user_id,
      amount: order.total_amount,
    });

    // 非同步觸發通知（不讓失敗影響付款確認結果）
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ orderId }),
    }).catch(e => console.error('[notify-order trigger]', e.message));

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
