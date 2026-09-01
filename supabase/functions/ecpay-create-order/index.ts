import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MERCHANT_ID = Deno.env.get('ECPAY_MERCHANT_ID')!;
const HASH_KEY = Deno.env.get('ECPAY_HASH_KEY')!;
const HASH_IV = Deno.env.get('ECPAY_HASH_IV')!;
const IS_SANDBOX = Deno.env.get('ECPAY_SANDBOX') !== 'false';
const ECPAY_URL = IS_SANDBOX
  ? 'https://payment-stage.ecpay.com.tw/Checkout/AIO'
  : 'https://payment.ecpay.com.tw/Checkout/AIO';
const SITE_URL = Deno.env.get('SITE_URL')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

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

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { line_user_id, line_display_name, items, total_amount,
            shipping_name, shipping_phone, shipping_address } = await req.json();

    // 建立訂單
    const { data: order, error: orderErr } = await supabase.from('orders').insert({
      line_user_id, line_display_name, items, total_amount,
      shipping_name, shipping_phone, shipping_address, status: 'pending',
    }).select().single();
    if (orderErr) throw new Error(orderErr.message);

    // 原子性扣庫存
    for (const item of items) {
      const { error } = await supabase.rpc('decrement_stock', { product_id: item.id, qty: item.qty });
      if (error) {
        await supabase.from('orders').delete().eq('id', order.id);
        throw new Error(`庫存不足：${item.name}`);
      }
    }

    // ECPay MerchantTradeNo：取 UUID 去連字號前 20 碼
    const tradeNo = (order.id as string).replace(/-/g, '').slice(0, 20);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const tradeDate = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const itemName = (items as { name: string; qty: number }[])
      .map(i => `${i.name} x${i.qty}`).join('#').slice(0, 400);

    const params: Record<string, string> = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: tradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: String(total_amount),
      TradeDesc: 'YCG.co 選物店',
      ItemName: itemName,
      ReturnURL: `${SUPABASE_URL}/functions/v1/ecpay-notify`,
      OrderResultURL: `${SITE_URL}/?page=order-confirm`,
      ChoosePayment: 'ALL',
      EncryptType: '1',
    };
    params.CheckMacValue = await calcCheckMacValue(params);

    // 儲存 tradeNo 供 notify 回查
    await supabase.from('orders').update({ line_pay_transaction_id: tradeNo }).eq('id', order.id);

    return new Response(JSON.stringify({ orderId: order.id, ecpayUrl: ECPAY_URL, params }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
