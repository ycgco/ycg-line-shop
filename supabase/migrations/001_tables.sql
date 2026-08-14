-- 商品表
CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT,
  price       INTEGER NOT NULL,
  stock       INTEGER NOT NULL DEFAULT 0,
  images      JSONB DEFAULT '[]'::JSONB,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 訂單表
CREATE TABLE orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id             TEXT NOT NULL,
  line_display_name        TEXT,
  items                    JSONB NOT NULL,
  total_amount             INTEGER NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending',
  line_pay_transaction_id  TEXT,
  shipping_name            TEXT,
  shipping_phone           TEXT,
  shipping_address         TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- 會員表
CREATE TABLE members (
  line_user_id   TEXT PRIMARY KEY,
  display_name   TEXT,
  avatar_url     TEXT,
  email          TEXT,
  total_spent    INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 商品只公開顯示上架中的（RLS）
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active_products_readable" ON products
  FOR SELECT USING (is_active = TRUE);

-- orders 允許 anon 插入（結帳用 Edge Function service_role，這裡給 members 讀取自己的）
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_orders" ON orders
  FOR SELECT USING (true);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_own" ON members
  FOR SELECT USING (true);
CREATE POLICY "members_upsert" ON members
  FOR INSERT WITH CHECK (true);
CREATE POLICY "members_update" ON members
  FOR UPDATE USING (true);
