-- 原子性庫存扣減（防止超賣）
CREATE OR REPLACE FUNCTION decrement_stock(product_id INTEGER, qty INTEGER)
RETURNS VOID AS $$
DECLARE
  current_stock INTEGER;
BEGIN
  SELECT stock INTO current_stock
    FROM products WHERE id = product_id FOR UPDATE;
  IF current_stock < qty THEN
    RAISE EXCEPTION '庫存不足：product_id=%', product_id;
  END IF;
  UPDATE products SET stock = stock - qty WHERE id = product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 更新會員累計消費
CREATE OR REPLACE FUNCTION increment_member_spent(uid TEXT, amount INTEGER)
RETURNS VOID AS $$
BEGIN
  INSERT INTO members (line_user_id, total_spent)
    VALUES (uid, amount)
  ON CONFLICT (line_user_id)
    DO UPDATE SET total_spent = members.total_spent + amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
