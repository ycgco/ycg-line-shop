async function initApp() {
  try {
    await liff.init({ liffId: CONFIG.LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    const profile = await liff.getProfile();
    window.__profile = profile;
    await upsertMember(profile);
  } catch (err) {
    document.getElementById('app').innerHTML =
      `<div class="error-page"><p>LINE 初始化失敗</p><p>${err.message}</p></div>`;
    return;
  }

  const params    = new URLSearchParams(window.location.search);
  const page      = params.get('page') || 'products';
  const productId = params.get('product');

  const infoPages = ['store-info', 'return-policy', 'terms', 'shopping-guide'];

  if (page === 'product' && productId) {
    renderProductDetail(productId);
  } else if (page === 'cart') {
    renderCart();
  } else if (page === 'checkout') {
    renderCheckout();
  } else if (page === 'order-confirm') {
    renderOrderConfirm();
  } else if (page === 'line-pay-confirm') {
    renderLinePayConfirm();
  } else if (page === 'orders') {
    renderOrders();
  } else if (page === 'admin-orders') {
    renderAdminOrders();
  } else if (page === 'admin-members') {
    renderAdminMembers();
  } else if (infoPages.includes(page)) {
    renderInfoPage(page);
  } else {
    renderProductList();
  }
}

initApp();
