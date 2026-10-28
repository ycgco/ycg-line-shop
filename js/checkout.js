async function renderCheckout() {
  const app  = document.getElementById('app');
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
        <label>配送方式</label>
        <div class="shipping-opts">
          <button type="button" class="ship-btn active" data-type="home">🚚 宅配 (黑貓)</button>
          <button type="button" class="ship-btn" data-type="store">📍 門市自取</button>
        </div>
      </div>

      <div class="form-group">
        <label>收件人姓名</label>
        <input type="text" name="name" required placeholder="王小明">
      </div>
      <div class="form-group">
        <label>聯絡電話</label>
        <input type="tel" name="phone" required placeholder="0912-345-678"
               pattern="^09[0-9]{8}$" title="請輸入 09 開頭的 10 位手機號碼">
      </div>

      <!-- 宅配欄位 -->
      <div id="fields-home" class="ship-fields">
        <div class="form-group">
          <label>郵遞區號</label>
          <input type="text" name="zip" placeholder="例：235" pattern="[0-9]{3,6}" maxlength="6">
        </div>
        <div class="form-group">
          <label>收件地址</label>
          <input type="text" name="address" placeholder="新北市中和區景平路 123 號">
        </div>
      </div>

      <!-- 門市自取 -->
      <div id="fields-store" class="ship-fields" style="display:none">
        <div class="store-pickup-info">
          <p>📍 新北市中和區捷運路 52 號</p>
          <p>請透過 LINE 與我們確認取貨時間</p>
        </div>
      </div>

      <div class="order-summary">
        <h3>訂單明細</h3>
        ${cart.map(i => `
          <div class="summary-row">
            <span>${i.name}${i.size ? ` <span class="item-size">${i.size}</span>` : ''} × ${i.qty}</span>
            <span>NT$ ${(i.price * i.qty).toLocaleString()}</span>
          </div>
        `).join('')}
        <div class="summary-total">
          <strong>合計</strong>
          <strong>NT$ ${total.toLocaleString()}</strong>
        </div>
      </div>

      <div class="form-group">
        <label>付款方式</label>
        <div class="payment-opts">
          <button type="button" class="pay-method-btn active" data-method="line_pay">
            LINE Pay
          </button>
          <button type="button" class="pay-method-btn" data-method="ecpay">
            💳 信用卡 / ATM / 超商
          </button>
        </div>
      </div>

      <button type="submit" class="pay-btn" id="pay-btn">前往付款</button>
    </form>
  `;

  document.querySelectorAll('.ship-btn').forEach(btn => {
    btn.addEventListener('click', () => setShipType(btn.dataset.type));
  });

  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.addEventListener('click', () => setPayMethod(btn.dataset.method));
  });

  document.getElementById('checkout-form').addEventListener('submit', handleCheckoutSubmit);
}

function setShipType(type) {
  document.querySelectorAll('.ship-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.ship-btn[data-type="${type}"]`).classList.add('active');
  document.querySelectorAll('.ship-fields').forEach(f => f.style.display = 'none');
  document.getElementById(`fields-${type}`).style.display = 'block';
}

function setPayMethod(method) {
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.pay-method-btn[data-method="${method}"]`).classList.add('active');
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('pay-btn');
  btn.disabled = true;
  btn.textContent = '處理中...';

  const cart      = getCart();
  const total     = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const fd        = new FormData(e.target);
  const shipType  = document.querySelector('.ship-btn.active').dataset.type;
  const payMethod = document.querySelector('.pay-method-btn.active').dataset.method;

  const orderData = {
    line_user_id:      window.__profile.userId,
    line_display_name: window.__profile.displayName,
    items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, size: i.size || null })),
    total_amount:   total,
    shipping_type:  shipType,
    shipping_name:  fd.get('name'),
    shipping_phone: fd.get('phone'),
  };

  if (shipType === 'home') {
    orderData.receiver_zip     = fd.get('zip') || '';
    orderData.shipping_address = fd.get('address');
  } else {
    orderData.shipping_address = '門市自取：新北市中和區捷運路52號';
  }

  try {
    if (payMethod === 'line_pay') {
      await startLinePayCheckout(orderData);
    } else {
      await startCheckout(orderData);
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '前往付款';
    showToast('發生錯誤：' + err.message);
  }
}

async function startLinePayCheckout(orderData) {
  const result = await callEdgeFunction('line-pay-request', orderData);
  localStorage.setItem('ycg_pending_order', result.orderId);
  window.location.href = result.paymentUrl;
}

async function startCheckout(orderData) {
  const result = await callEdgeFunction('ecpay-create-order', orderData);
  localStorage.setItem('ycg_pending_order', result.orderId);

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = result.ecpayUrl;
  for (const [key, value] of Object.entries(result.params)) {
    const input = document.createElement('input');
    input.type  = 'hidden';
    input.name  = key;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
