async function renderCheckout() {
  const app = document.getElementById('app');
  const cart = getCart();
  if (cart.length === 0) { window.location = '?page=products'; return; }

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  app.innerHTML = `
    <div class="page-header">
      <button onclick="history.back()">← 返回</button>
      <h2>填寫收件資料</h2>
      <span></span>
    </div>
    <form class="checkout-form" id="checkout-form">
      <div class="form-group">
        <label>收件人姓名</label>
        <input type="text" name="name" required placeholder="王小明">
      </div>
      <div class="form-group">
        <label>聯絡電話</label>
        <input type="tel" name="phone" required placeholder="0912-345-678"
               pattern="^09[0-9]{8}$" title="請輸入 09 開頭的 10 位手機號碼">
      </div>
      <div class="form-group">
        <label>收件地址</label>
        <input type="text" name="address" required placeholder="新北市中和區景平路 123 號">
      </div>
      <div class="order-summary">
        <h3>訂單明細</h3>
        ${cart.map(i => `
          <div class="summary-row">
            <span>${i.name} × ${i.qty}</span>
            <span>NT$ ${(i.price * i.qty).toLocaleString()}</span>
          </div>
        `).join('')}
        <div class="summary-total">
          <strong>合計</strong>
          <strong>NT$ ${total.toLocaleString()}</strong>
        </div>
      </div>
      <button type="submit" class="pay-btn" id="pay-btn">
        前往付款
      </button>
    </form>
  `;

  document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('pay-btn');
    btn.disabled = true;
    btn.textContent = '處理中...';

    const fd = new FormData(e.target);
    try {
      await startCheckout({
        line_user_id: window.__profile.userId,
        line_display_name: window.__profile.displayName,
        items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
        total_amount: total,
        shipping_name: fd.get('name'),
        shipping_phone: fd.get('phone'),
        shipping_address: fd.get('address'),
      });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '前往付款';
      showToast('發生錯誤：' + err.message);
    }
  });
}

async function startCheckout(orderData) {
  const result = await callEdgeFunction('ecpay-create-order', orderData);
  localStorage.setItem('ycg_pending_order', result.orderId);

  // 建立隱藏表單並自動送出至 ECPay
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = result.ecpayUrl;
  for (const [key, value] of Object.entries(result.params)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
