async function renderOrderConfirm() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">確認付款狀態中，請稍候...</div>';

  const orderId = localStorage.getItem('ycg_pending_order');
  if (!orderId) {
    app.innerHTML = `
      <div class="error-page">
        <h2>❌ 找不到訂單資訊</h2>
        <p>請聯絡客服確認付款狀態</p>
        <button onclick="window.location='?page=products'">回到商店</button>
      </div>
    `;
    return;
  }

  // 輪詢等待 ECPay webhook 更新訂單狀態（最多等 8 秒）
  let status = 'pending';
  for (let i = 0; i < 8; i++) {
    const { data: order } = await db.from('orders').select('status').eq('id', orderId).single();
    if (order?.status === 'paid') { status = 'paid'; break; }
    if (i < 7) await new Promise(r => setTimeout(r, 1000));
  }

  if (status === 'paid') {
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
  } else {
    app.innerHTML = `
      <div class="error-page">
        <h2>⏳ 付款確認中</h2>
        <p>若已完成付款，訂單通常在數分鐘內更新</p>
        <p>如有疑問請聯絡客服並提供訂單編號：</p>
        <p class="order-id">${orderId.slice(0, 8).toUpperCase()}</p>
        <button onclick="renderOrderConfirm()">重新確認</button>
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

async function renderLinePayConfirm() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">LINE Pay 確認中，請稍候...</div>';

  const params        = new URLSearchParams(window.location.search);
  const transactionId = params.get('transactionId');
  const orderId       = params.get('orderId') || localStorage.getItem('ycg_pending_order');

  if (!transactionId || !orderId) {
    app.innerHTML = `
      <div class="error-page">
        <h2>❌ 缺少付款資訊</h2>
        <p>請聯絡客服確認付款狀態</p>
        <button onclick="window.location='?page=products'">回到商店</button>
      </div>
    `;
    return;
  }

  try {
    await callEdgeFunction('line-pay-confirm', { transactionId, orderId });
    localStorage.removeItem('ycg_cart');
    localStorage.removeItem('ycg_pending_order');
    window.location.href = '?page=order-confirm';
  } catch (err) {
    app.innerHTML = `
      <div class="error-page">
        <h2>❌ 付款確認失敗</h2>
        <p>${err.message}</p>
        <p>訂單編號：${orderId.slice(0, 8).toUpperCase()}</p>
        <p>請聯絡客服，提供上方訂單編號</p>
        <button onclick="window.location='?page=products'">回到商店</button>
      </div>
    `;
  }
}

async function renderAdminOrders() {
  const app = document.getElementById('app');

  if (window.__profile.userId !== CONFIG.ADMIN_USER_ID) {
    app.innerHTML = '<div class="error-page"><p>無存取權限</p></div>';
    return;
  }

  app.innerHTML = '<div class="loading">載入訂單中...</div>';

  const STATUS_LABEL = {
    pending:   '⏳ 待付款',
    paid:      '✅ 已付款',
    shipped:   '🚚 已出貨',
    completed: '🎉 已完成',
    cancelled: '❌ 已取消',
    refunded:  '↩️ 已退款',
  };

  try {
    const { data: orders, error } = await db
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    app.innerHTML = `
      <div class="page-header">
        <button onclick="window.location='?page=products'">← 商店</button>
        <h2>後台訂單</h2><span></span>
      </div>
      <div class="order-list">
        ${orders.map(o => `
          <div class="order-card">
            <div class="order-header">
              <span class="order-id-text">${o.id.slice(0, 8).toUpperCase()}</span>
              <span class="order-status">${STATUS_LABEL[o.status] || o.status}</span>
            </div>
            <div class="order-items">
              <p>${o.line_display_name || o.line_user_id}</p>
              ${o.items.map(i => `<p>${i.name} × ${i.qty}</p>`).join('')}
              <p>${o.shipping_name} ${o.shipping_phone}</p>
              <p style="font-size:12px;color:#888">${o.payment_method === 'line_pay' ? 'LINE Pay' : 'ECPay'}</p>
            </div>
            <div class="order-footer">
              <span class="order-date">${new Date(o.created_at).toLocaleDateString('zh-TW')}</span>
              <span class="order-total">NT$ ${o.total_amount.toLocaleString()}</span>
            </div>
            ${o.payment_method === 'line_pay' && o.status === 'paid' ? `
              <button class="refund-btn" onclick="handleRefund('${o.id}', ${o.total_amount})">退款 NT$ ${o.total_amount.toLocaleString()}</button>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    app.innerHTML = `<p class="error">載入失敗：${err.message}</p>`;
  }
}

async function handleRefund(orderId, amount) {
  if (!confirm(`確定要退款 NT$ ${amount.toLocaleString()} 給此訂單嗎？`)) return;
  try {
    await callEdgeFunction('line-pay-refund', { orderId });
    showToast('退款成功');
    renderAdminOrders();
  } catch (err) {
    showToast('退款失敗：' + err.message);
  }
}
