import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { linePayHeaders, LINE_PAY_BASE } from '../_shared/line-pay.ts';

const CHANNEL_ID     = (Deno.env.get('LINE_PAY_CHANNEL_ID') ?? '').trim();
const CHANNEL_SECRET = (Deno.env.get('LINE_PAY_CHANNEL_SECRET') ?? '').trim();
const IS_SANDBOX     = (Deno.env.get('LINE_PAY_SANDBOX') ?? '').trim().toLowerCase() !== 'false';
const BASE_URL       = IS_SANDBOX ? LINE_PAY_BASE.sandbox : LINE_PAY_BASE.prod;
const SITE_URL       = Deno.env.get('SITE_URL')!;

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
    const {
      line_user_id, line_display_name, items, total_amount,
      shipping_name, shipping_phone, shipping_address,
      shipping_type = 'home', receiver_zip,
    } = await req.json();

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        line_user_id, line_display_name, items, total_amount,
        shipping_name, shipping_phone, shipping_address,
        shipping_type, receiver_zip: receiver_zip || null,
        status: 'pending',
        payment_method: 'line_pay',
      })
      .select()
      .single();
    if (orderErr) throw new Error(orderErr.message);

    for (const item of items as { id: number; name: string; qty: number; price: number; size?: string }[]) {
      const { error } = await supabase.rpc('decrement_stock', {
        product_id: item.id, qty: item.qty, size: item.size || null,
      });
      if (error) {
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error(`庫存不足：${item.name}`);
      }
    }

    console.log(`[LP-REQ] IS_SANDBOX=${IS_SANDBOX} URL=${BASE_URL} CID=${CHANNEL_ID.slice(0,6)} SLEN=${CHANNEL_SECRET.length}`);
    const uri         = '/v3/payments/request';
    const sanitize    = (s: string) => s.replace(/[#]/g, ' ').trim();
    const requestBody = JSON.stringify({
      amount:   total_amount,
      currency: 'TWD',
      orderId:  order.id,
      packages: [{
        id:       'pkg-1',
        amount:   total_amount,
        products: (items as { name: string; qty: number; price: number }[]).map(i => ({
          name:     sanitize(i.name),
          quantity: i.qty,
          price:    i.price,
        })),
      }],
      redirectUrls: {
        confirmUrl: `${SITE_URL}/?page=line-pay-confirm`,
        cancelUrl:  `${SITE_URL}/?page=checkout`,
      },
    });

    const headers = await linePayHeaders(CHANNEL_ID, CHANNEL_SECRET, uri, requestBody);
    const lpRes   = await fetch(`${BASE_URL}${uri}`, { method: 'POST', headers, body: requestBody });
    const lpJson  = await lpRes.json();

    if (lpJson.returnCode !== '0000') {
      await supabase.from('orders').delete().eq('id', order.id);
      throw new Error(`LINE Pay 錯誤 ${lpJson.returnCode}: ${lpJson.returnMessage}`);
    }

    const { transactionId, paymentUrl } = lpJson.info;

    await supabase.from('orders')
      .update({ line_pay_transaction_id: String(transactionId) })
      .eq('id', order.id);

    return new Response(
      JSON.stringify({ orderId: order.id, paymentUrl: paymentUrl.web }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
