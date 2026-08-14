import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')!;
const ADMIN_LINE_USER_ID = Deno.env.get('ADMIN_LINE_USER_ID')!;

async function pushLine(to: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text }],
    }),
  });
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { orderId } = await req.json();
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
  if (!order) return new Response('not found', { status: 404 });

  const itemsList = order.items.map((i: { name: string; qty: number }) => `• ${i.name} × ${i.qty}`).join('\n');
  const shortId = (order.id as string).slice(0, 8).toUpperCase();

  await pushLine(order.line_user_id,
    `✅ 訂單確認！\n\n` +
    `訂單編號：${shortId}\n` +
    `─────────────────\n` +
    `${itemsList}\n` +
    `─────────────────\n` +
    `合計：NT$ ${order.total_amount.toLocaleString()}\n\n` +
    `收件地址：${order.shipping_address}\n\n` +
    `感謝您的購買！我們將盡快出貨 🚚`
  );

  await pushLine(ADMIN_LINE_USER_ID,
    `🛍️ 新訂單！\n\n` +
    `買家：${order.line_display_name}\n` +
    `訂單：${shortId}\n` +
    `─────────────────\n` +
    `${itemsList}\n` +
    `─────────────────\n` +
    `合計：NT$ ${order.total_amount.toLocaleString()}\n\n` +
    `收件：${order.shipping_name} ${order.shipping_phone}\n` +
    `地址：${order.shipping_address}`
  );

  return new Response('ok');
});
