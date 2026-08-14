async function renderOrderConfirm() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">確認付款中，請稍候...</div>';

  const params = new URLSearchParams(window.location.search);
  const transactionId = params.get('transactionId');
  const orderId = localStorage.getItem('ycg_pending_order');

  if (!transactionId || !orderId) {
    app.innerHTML = `
      <div class="error-page">
        <h2>❌ 付款資訊不完整</h2>
        <p>請聯絡客服或重新下單</p>
        <button onclick="window.location='?page=products'">回到商店</button>
      </div>
    `;
    return;
  }

  try {
    await callEdgeFunction('line-pay-confirm', { orderId, transactionId });
    localStorage.removeItem('ycg_cart');
    localStorage.removeItem('ycg_pending_order');

    app.innerHTML = `
      <div class="success-page">
        <div class="success-icon">✅</div>
        <h2>付款成功！</h2>
        <p>訂單編號：<span class="order-id">${orderId.slice(0, 8).toUpperCase()}</span></p>
        <p>訂單確認已透過 LINE 傳送給您 📩</p>
        <p>我們將盡快為您備貨出貨</p>
        <button onclick="window.location='?page=orders'">查看我的訂單</button>
        <button onclick="window.location='?page=products'">繼續購物</button>
      </div>
    `;
  } catch (err) {
    app.innerHTML = `
      <div class="error-page">
        <h2>❌ 付款確認失敗</h2>
        <p>${err.message}</p>
        <button onclick="window.location='?page=cart'">返回購物車</button>
        <button onclick="window.location='?page=products'">回到商店</button>
      </div>
    `;
  }
}

async function renderOrders() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">載入訂單中...</div>';

  const STATUS_LABEL = {
    pending:   '⏳ 待付款',
    paid:      '✅ 已付款',
    shipped:   '🚚 已出貨',
    completed: '🎉 已完成',
    cancelled: '❌ 已取消',
  };

  try {
    const orders = await getMyOrders(window.__profile.userId);

    if (orders.length === 0) {
      app.innerHTML = `
        <div class="page-header">
          <button onclick="window.location='?page=products'">← 回到商店</button>
          <h2>我的訂單</h2><span></span>
        </div>
        <div class="empty-cart">
          <p>還沒有訂單</p>
          <button onclick="window.location='?page=products'">去購物</button>
        </div>
      `;
      return;
    }

    app.innerHTML = `
      <div class="page-header">
        <button onclick="window.location='?page=products'">← 回到商店</button>
        <h2>我的訂單</h2><span></span>
      </div>
      <div class="order-list">
        ${orders.map(o => `
          <div class="order-card">
            <div class="order-header">
              <span class="order-id-text">編號：${o.id.slice(0, 8).toUpperCase()}</span>
              <span class="order-status">${STATUS_LABEL[o.status] || o.status}</span>
            </div>
            <div class="order-items">
              ${o.items.map(i => `<p>${i.name} × ${i.qty}</p>`).join('')}
            </div>
            <div class="order-footer">
              <span class="order-date">${new Date(o.created_at).toLocaleDateString('zh-TW')}</span>
              <span class="order-total">NT$ ${o.total_amount.toLocaleString()}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    app.innerHTML = `<p class="error">載入失敗：${err.message}</p>`;
  }
}
