import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { linePayHeaders, LINE_PAY_BASE } from '../_shared/line-pay.ts';

const CHANNEL_ID     = (Deno.env.get('LINE_PAY_CHANNEL_ID') ?? '').trim();
const CHANNEL_SECRET = (Deno.env.get('LINE_PAY_CHANNEL_SECRET') ?? '').trim();
const IS_SANDBOX     = (Deno.env.get('LINE_PAY_SANDBOX') ?? '').trim().toLowerCase() !== 'false';
const BASE_URL       = IS_SANDBOX ? LINE_PAY_BASE.sandbox : LINE_PAY_BASE.prod;

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { transactionId, orderId } = await req.json();

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('total_amount, status, line_user_id, shipping_type, payment_method')
      .eq('id', orderId)
      .eq('payment_method', 'line_pay')
      .single();
    if (fetchErr || !order) throw new Error('找不到訂單');
    if (order.status !== 'pending') throw new Error('訂單已處理過');

    const uri         = `/v3/payments/${transactionId}/confirm`;
    const requestBody = JSON.stringify({ amount: order.total_amount, currency: 'TWD' });
    const headers     = await linePayHeaders(CHANNEL_ID, CHANNEL_SECRET, uri, requestBody);
    const lpRes       = await fetch(`${BASE_URL}${uri}`, { method: 'POST', headers, body: requestBody });
    const lpJson      = await lpRes.json();

    if (lpJson.returnCode !== '0000') {
      throw new Error(`LINE Pay confirm 失敗 ${lpJson.returnCode}: ${lpJson.returnMessage}`);
    }

    await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId);

    await supabase.rpc('increment_member_spent', {
      uid: order.line_user_id, amount: order.total_amount,
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    fetch(`${supabaseUrl}/functions/v1/notify-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({ orderId }),
    }).catch(e => console.error('[notify]', e.message));

    if (order.shipping_type !== 'store') {
      fetch(`${supabaseUrl}/functions/v1/ecpay-logistics-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ orderId }),
      }).catch(e => console.error('[logistics]', e.message));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
