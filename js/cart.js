function getCart() {
  return JSON.parse(localStorage.getItem('ycg_cart') || '[]');
}

function saveCart(cart) {
  localStorage.setItem('ycg_cart', JSON.stringify(cart));
}

function getCartCount() {
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

function addToCart(id, name, price) {
  const cart = getCart();
  const existing = cart.find(i => i.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id, name, price, qty: 1 });
  }
  saveCart(cart);
  showToast('已加入購物車 🛒');
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

async function renderCart() {
  const app = document.getElementById('app');
  const cart = getCart();

  if (cart.length === 0) {
    app.innerHTML = `
      <div class="page-header">
        <button onclick="window.location='?page=products'">← 繼續購物</button>
        <h2>購物車</h2><span></span>
      </div>
      <div class="empty-cart">
        <p>購物車是空的</p>
        <button onclick="window.location='?page=products'">去逛逛</button>
      </div>
    `;
    return;
  }

  const ids = cart.map(i => i.id);
  const { data: products } = await db.from('products')
    .select('id, stock, is_active').in('id', ids);
  const stockMap = Object.fromEntries((products || []).map(p => [p.id, p]));

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const hasIssue = cart.some(i => {
    const p = stockMap[i.id];
    return !p || !p.is_active || p.stock < i.qty;
  });

  app.innerHTML = `
    <div class="page-header">
      <button onclick="window.location='?page=products'">← 繼續購物</button>
      <h2>購物車</h2><span></span>
    </div>
    <div class="cart-list">
      ${cart.map(item => {
        const p = stockMap[item.id];
        const issue = !p || !p.is_active ? '商品已下架' : p.stock < item.qty ? '庫存不足' : '';
        return `
          <div class="cart-item">
            <div class="item-info">
              <p class="item-name">${item.name}</p>
              ${issue ? `<p class="stock-warning">⚠️ ${issue}</p>` : ''}
            </div>
            <div class="item-controls">
              <button onclick="cartChangeQty(${item.id}, -1)">−</button>
              <span>${item.qty}</span>
              <button onclick="cartChangeQty(${item.id}, 1)">+</button>
            </div>
            <p class="item-price">NT$ ${(item.price * item.qty).toLocaleString()}</p>
            <button class="remove-btn" onclick="cartRemove(${item.id})">✕</button>
          </div>
        `;
      }).join('')}
    </div>
    <div class="cart-footer">
      <p class="total">合計：<strong>NT$ ${total.toLocaleString()}</strong></p>
      <button class="checkout-btn" ${hasIssue ? 'disabled' : ''}
              onclick="window.location='?page=checkout'">
        ${hasIssue ? '請移除問題商品' : '前往結帳'}
      </button>
    </div>
  `;
}

function cartChangeQty(id, delta) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    cartRemove(id);
    return;
  }
  item.qty = newQty;
  saveCart(cart);
  renderCart();
}

function cartRemove(id) {
  saveCart(getCart().filter(i => i.id !== id));
  renderCart();
}
