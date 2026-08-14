const { createClient } = supabase;
const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

async function upsertMember(profile) {
  const { error } = await db.from('members').upsert({
    line_user_id: profile.userId,
    display_name: profile.displayName,
    avatar_url: profile.pictureUrl,
  }, { onConflict: 'line_user_id' });
  if (error) console.error('[upsertMember]', error.message);
}

async function getProducts(category) {
  let q = db.from('products').select('*').order('id');
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

async function getProduct(id) {
  const { data, error } = await db.from('products').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function getMyOrders(lineUserId) {
  const { data, error } = await db.from('orders')
    .select('*')
    .eq('line_user_id', lineUserId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

async function callEdgeFunction(name, body) {
  const resp = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const result = await resp.json();
  if (!resp.ok) throw new Error(result.error || '請求失敗');
  return result;
}
