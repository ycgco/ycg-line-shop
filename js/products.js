async function renderProductList() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">載入商品中...</div>';

  try {
    const products = await getProducts();
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    const cartCount = getCartCount();

    app.innerHTML = `
      <div class="shop-header">
        <h1>YCG.co</h1>
        <a class="cart-link" href="?page=cart">🛒 ${cartCount > 0 ? cartCount : ''}</a>
      </div>
      <div class="category-tabs">
        <button class="tab active" data-cat="">全部</button>
        ${categories.map(c => `<button class="tab" data-cat="${c}">${c}</button>`).join('')}
      </div>
      <div class="product-grid" id="product-grid">
        ${renderProductCards(products)}
      </div>
    `;

    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const filtered = await getProducts(btn.dataset.cat || undefined);
        document.getElementById('product-grid').innerHTML = renderProductCards(filtered);
      });
    });

  } catch (err) {
    app.innerHTML = `<p class="error">商品載入失敗：${err.message}</p>`;
  }
}

function renderProductCards(products) {
  if (products.length === 0) return '<p style="padding:24px;color:#888;grid-column:span 2">暫無商品</p>';
  return products.map(p => {
    const img = p.images?.[0] || `https://via.placeholder.com/400x400?text=${encodeURIComponent(p.name)}`;
    return `
      <div class="product-card ${p.stock === 0 ? 'sold-out' : ''}"
           onclick="window.location='?page=product&product=${p.id}'">
        <img src="${img}" alt="${p.name}" loading="lazy">
        <div class="product-info">
          <p class="product-name">${p.name}</p>
          <p class="product-price">NT$ ${p.price.toLocaleString()}</p>
          ${p.stock === 0 ? '<p class="out-of-stock">已售完</p>' : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function renderProductDetail(productId) {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">載入中...</div>';

  try {
    const p = await getProduct(productId);
    const imgs = p.images || [];
    const mainImg = imgs[0] || `https://via.placeholder.com/400x400?text=${encodeURIComponent(p.name)}`;
    const cartCount = getCartCount();

    app.innerHTML = `
      <div class="page-header">
        <button onclick="history.back()">← 返回</button>
        <a class="cart-link" href="?page=cart">🛒 ${cartCount > 0 ? cartCount : ''}</a>
      </div>
      <div class="product-detail">
        <img class="main-img" id="main-img" src="${mainImg}" alt="${p.name}">
        ${imgs.length > 1 ? `
          <div class="thumbnail-row">
            ${imgs.map(url => `<img src="${url}" onclick="document.getElementById('main-img').src='${url}'">`).join('')}
          </div>
        ` : ''}
        <div class="detail-info">
          <p class="category-tag">${p.category || ''}</p>
          <h2>${p.name}</h2>
          <p class="detail-price">NT$ ${p.price.toLocaleString()}</p>
          <p class="detail-stock">${p.stock > 0 ? `庫存：${p.stock} 件` : '⚠️ 已售完'}</p>
          <p class="detail-desc">${(p.description || '').replace(/\n/g, '<br>')}</p>
        </div>
        <button class="add-to-cart-btn"
                id="add-btn"
                ${p.stock === 0 ? 'disabled' : ''}
                onclick="handleAddToCart(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.price}, ${p.stock})">
          ${p.stock === 0 ? '已售完' : '加入購物車'}
        </button>
      </div>
    `;
  } catch (err) {
    app.innerHTML = `<p class="error">商品載入失敗：${err.message}</p>`;
  }
}

function handleAddToCart(id, name, price, stock) {
  const cart = getCart();
  const existing = cart.find(i => i.id === id);
  const currentQty = existing ? existing.qty : 0;
  if (currentQty >= stock) {
    showToast('已達庫存上限 ⚠️');
    return;
  }
  addToCart(id, name, price);
}
