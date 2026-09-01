import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HASH_KEY = Deno.env.get('ECPAY_HASH_KEY')!;
const HASH_IV = Deno.env.get('ECPAY_HASH_IV')!;

function phpUrlencode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%20/g, '+');
}

async function calcCheckMacValue(params: Record<string, string>): Promise<string> {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const str = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  const raw = `HashKey=${HASH_KEY}&${str}&HashIV=${HASH_IV}`;
  const encoded = phpUrlencode(raw).toLowerCase();
  const buf = new TextEncoder().encode(encoded);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.toUpperCase();
}

serve(async (req) => {
  // ECPay 會用 POST 送付款結果
  if (req.method !== 'POST') return new Response('1|OK');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const text = await req.text();
    const formData = new URLSearchParams(text);
    const params: Record<string, string> = {};
    for (const [k, v] of formData) params[k] = v;

    // 驗證簽章
    const receivedMac = params['CheckMacValue'];
    const paramsWithoutMac = { ...params };
    delete paramsWithoutMac['CheckMacValue'];
    const computedMac = await calcCheckMacValue(paramsWithoutMac);

    if (computedMac !== receivedMac) {
      console.error('CheckMacValue 驗證失敗');
      return new Response('0|Fail');
    }

    const tradeNo = params['MerchantTradeNo'];
    const rtnCode = params['RtnCode'];

    const { data: order } = await supabase.from('orders')
      .select('*').eq('line_pay_transaction_id', tradeNo).single();

    if (!order) {
      console.error('找不到訂單：', tradeNo);
      return new Response('1|OK');
    }

    if (rtnCode === '1' && order.status === 'pending') {
      await supabase.from('orders').update({ status: 'paid' }).eq('id', order.id);
      await supabase.rpc('increment_member_spent', {
        uid: order.line_user_id,
        amount: order.total_amount,
      });

      // 非同步推播通知
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ orderId: order.id }),
      }).catch(e => console.error('[notify]', e.message));
    }

  } catch (err) {
    console.error('[ecpay-notify]', (err as Error).message);
  }

  // ECPay 規定必須回傳 1|OK
  return new Response('1|OK');
});
