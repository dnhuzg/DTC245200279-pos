'use strict';

// ---------- Tiện ích ----------
const $ = (sel) => document.querySelector(sel);
const money = (n) => Number(n).toLocaleString('vi-VN') + ' ₫';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(message, type = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), type === 'error' ? 6000 : 3500);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.error || `Lỗi ${res.status}`;
    if (Array.isArray(data.details)) {
      msg += ':\n' + data.details.map((d) => `• ${d.name}: cần ${d.requested}, còn ${d.available}`).join('\n');
    }
    throw new Error(msg);
  }
  return data;
}

function stockBadge(p) {
  if (p.stock === 0) return '<span class="badge out">Hết hàng</span>';
  if (p.is_low) return '<span class="badge">Sắp hết</span>';
  return '';
}

const debounce = (fn, ms = 250) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

// ---------- Tabs ----------
const loaders = {};
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  showTab(btn.dataset.tab);
});
function showTab(name) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${name}`));
  loaders[name]?.();
}

document.querySelectorAll('dialog [data-close]').forEach((btn) =>
  btn.addEventListener('click', () => btn.closest('dialog').close())
);

// ---------- Tổng quan ----------
loaders.dashboard = async () => {
  try {
    const [stats, low] = await Promise.all([api('/api/stats'), api('/api/products/low-stock')]);
    $('#st-revenue').textContent = money(stats.revenue_today);
    $('#st-invoices').textContent = stats.invoices_today;
    $('#st-products').textContent = stats.products;
    $('#st-low').textContent = `${stats.low_stock} (${stats.out_of_stock} hết)`;
    $('#low-stock-body').innerHTML = low.length
      ? low.map((p) => `
          <tr class="low">
            <td>${esc(p.sku)}</td>
            <td>${esc(p.name)} ${stockBadge(p)}</td>
            <td class="num">${p.stock} ${esc(p.unit)}</td>
            <td class="num">${p.min_stock}</td>
            <td class="num"><button class="small" data-restock="${p.id}">Nhập hàng</button></td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="empty">✅ Không có sản phẩm nào sắp hết hàng</td></tr>';
  } catch (err) {
    toast(err.message, 'error');
  }
};

// Nhập hàng nhanh — dùng chung cho tab Tổng quan và Sản phẩm
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-restock]');
  if (!btn) return;
  const input = prompt('Nhập thêm bao nhiêu? (số âm để điều chỉnh giảm)', '10');
  if (input === null) return;
  const delta = Number(input);
  if (!Number.isInteger(delta) || delta === 0) return toast('Số lượng không hợp lệ', 'error');
  try {
    const p = await api(`/api/products/${btn.dataset.restock}/stock`, { method: 'POST', body: { delta } });
    toast(`Đã cập nhật "${p.name}": tồn kho ${p.stock} ${p.unit}`, p.is_low ? 'warn' : '');
    refreshActive();
  } catch (err) {
    toast(err.message, 'error');
  }
});

function refreshActive() {
  const active = document.querySelector('#tabs button.active')?.dataset.tab;
  loaders[active]?.();
}

// ---------- Bán hàng ----------
const cart = new Map(); // productId -> { product, qty }
let saleProducts = [];

loaders.sale = async () => {
  try {
    const q = $('#sale-search').value.trim();
    saleProducts = await api('/api/products' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    renderSaleProducts();
    renderCart();
  } catch (err) {
    toast(err.message, 'error');
  }
};
$('#sale-search').addEventListener('input', debounce(() => loaders.sale()));

function renderSaleProducts() {
  $('#sale-products').innerHTML = saleProducts.length
    ? saleProducts.map((p) => `
        <button class="product-tile" data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>
          <span class="name">${esc(p.name)}</span>
          <span class="meta">${esc(p.sku)} · còn ${p.stock} ${esc(p.unit)} ${stockBadge(p)}</span>
          <span class="price">${money(p.price)}</span>
        </button>`).join('')
    : '<p class="empty">Không tìm thấy sản phẩm</p>';
}

$('#sale-products').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add]');
  if (!btn) return;
  const product = saleProducts.find((p) => p.id === Number(btn.dataset.add));
  const line = cart.get(product.id) || { product, qty: 0 };
  if (line.qty + 1 > product.stock) return toast(`"${product.name}" chỉ còn ${product.stock} ${product.unit}`, 'warn');
  line.qty += 1;
  cart.set(product.id, line);
  renderCart();
});

function renderCart() {
  const lines = [...cart.values()];
  $('#cart-body').innerHTML = lines.length
    ? lines.map(({ product: p, qty }) => `
        <tr>
          <td>${esc(p.name)}<br><small>${money(p.price)}</small></td>
          <td class="num"><input class="qty" type="number" min="1" max="${p.stock}" value="${qty}" data-qty="${p.id}"></td>
          <td class="num">${money(p.price * qty)}</td>
          <td><button class="small danger" data-remove="${p.id}" aria-label="Xóa">✕</button></td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="empty">Chọn sản phẩm bên trái để thêm vào hóa đơn</td></tr>';
  const total = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  $('#cart-total').textContent = money(total);
  $('#cart-checkout').disabled = lines.length === 0;
}

$('#cart-body').addEventListener('change', (e) => {
  const id = Number(e.target.dataset.qty);
  if (!id) return;
  const line = cart.get(id);
  const qty = Math.floor(Number(e.target.value));
  if (!qty || qty < 1) cart.delete(id);
  else line.qty = Math.min(qty, line.product.stock);
  renderCart();
});
$('#cart-body').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  cart.delete(Number(btn.dataset.remove));
  renderCart();
});
$('#cart-clear').addEventListener('click', () => { cart.clear(); renderCart(); });

$('#cart-checkout').addEventListener('click', async () => {
  const btn = $('#cart-checkout');
  btn.disabled = true;
  try {
    const invoice = await api('/api/invoices', {
      method: 'POST',
      body: {
        customer_name: $('#cart-customer').value,
        note: $('#cart-note').value,
        items: [...cart.values()].map((l) => ({ product_id: l.product.id, quantity: l.qty })),
      },
    });
    cart.clear();
    $('#cart-customer').value = '';
    $('#cart-note').value = '';
    let msg = `✅ Đã tạo hóa đơn ${invoice.code} — ${money(invoice.total)}`;
    if (invoice.low_stock.length) {
      msg += '\n⚠️ Tồn kho thấp:\n' + invoice.low_stock.map((p) => `• ${p.name}: còn ${p.stock} ${p.unit}`).join('\n');
    }
    toast(msg, invoice.low_stock.length ? 'warn' : '');
    await loaders.sale();
  } catch (err) {
    toast(err.message, 'error');
    await loaders.sale(); // tải lại tồn kho mới nhất
  } finally {
    renderCart();
  }
});

// ---------- Sản phẩm ----------
loaders.products = async () => {
  try {
    const params = new URLSearchParams();
    const q = $('#prod-search').value.trim();
    if (q) params.set('q', q);
    if ($('#prod-low').checked) params.set('low', '1');
    const products = await api('/api/products?' + params);
    $('#prod-body').innerHTML = products.length
      ? products.map((p) => `
          <tr class="${p.is_low ? 'low' : ''}">
            <td>${esc(p.sku)}</td>
            <td>${esc(p.name)} ${stockBadge(p)}</td>
            <td>${esc(p.category)}</td>
            <td class="num">${money(p.price)}</td>
            <td class="num">${p.stock} ${esc(p.unit)}</td>
            <td class="num">${p.min_stock}</td>
            <td class="num">
              <button class="small secondary" data-restock="${p.id}">± Kho</button>
              <button class="small secondary" data-edit="${p.id}">Sửa</button>
              <button class="small danger" data-delete="${p.id}">Xóa</button>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="7" class="empty">Không có sản phẩm</td></tr>';
  } catch (err) {
    toast(err.message, 'error');
  }
};
$('#prod-search').addEventListener('input', debounce(() => loaders.products()));
$('#prod-low').addEventListener('change', () => loaders.products());

async function openProductDialog(id) {
  const form = $('#prod-form');
  form.reset();
  const categories = await api('/api/products/categories').catch(() => []);
  $('#category-list').innerHTML = categories.map((c) => `<option value="${esc(c)}">`).join('');
  if (id) {
    const p = await api(`/api/products/${id}`);
    for (const key of ['id', 'sku', 'name', 'category', 'unit', 'price', 'stock', 'min_stock']) form.elements[key].value = p[key];
    $('#prod-dialog-title').textContent = `Sửa sản phẩm ${p.sku}`;
  } else {
    form.elements.id.value = '';
    form.elements.stock.value = 0;
    form.elements.min_stock.value = 5;
    $('#prod-dialog-title').textContent = 'Thêm sản phẩm';
  }
  $('#prod-dialog').showModal();
}

$('#prod-new').addEventListener('click', () => openProductDialog().catch((err) => toast(err.message, 'error')));
$('#prod-body').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-delete]');
  try {
    if (edit) await openProductDialog(edit.dataset.edit);
    if (del && confirm('Xóa sản phẩm này?')) {
      await api(`/api/products/${del.dataset.delete}`, { method: 'DELETE' });
      toast('Đã xóa sản phẩm');
      loaders.products();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('#prod-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const body = {
    sku: f.sku.value, name: f.name.value, category: f.category.value, unit: f.unit.value,
    price: Number(f.price.value), stock: Number(f.stock.value), min_stock: Number(f.min_stock.value),
  };
  try {
    const id = f.id.value;
    await api(id ? `/api/products/${id}` : '/api/products', { method: id ? 'PUT' : 'POST', body });
    $('#prod-dialog').close();
    toast(id ? 'Đã cập nhật sản phẩm' : 'Đã thêm sản phẩm');
    loaders.products();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------- Hóa đơn ----------
loaders.invoices = async () => {
  try {
    const invoices = await api('/api/invoices?limit=100');
    $('#inv-body').innerHTML = invoices.length
      ? invoices.map((i) => `
          <tr>
            <td>${esc(i.code)}</td>
            <td>${esc(i.created_at)}</td>
            <td>${esc(i.customer_name)}</td>
            <td class="num">${i.item_count}</td>
            <td class="num">${money(i.total)}</td>
            <td class="num"><button class="small secondary" data-view="${i.id}">Xem</button></td>
          </tr>`).join('')
      : '<tr><td colspan="6" class="empty">Chưa có hóa đơn</td></tr>';
  } catch (err) {
    toast(err.message, 'error');
  }
};

$('#inv-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  try {
    const inv = await api(`/api/invoices/${btn.dataset.view}`);
    $('#inv-detail').innerHTML = `
      <h2>Hóa đơn ${esc(inv.code)}</h2>
      <p>Thời gian: ${esc(inv.created_at)}<br>Khách hàng: ${esc(inv.customer_name)}${inv.note ? `<br>Ghi chú: ${esc(inv.note)}` : ''}</p>
      <table>
        <thead><tr><th>Sản phẩm</th><th class="num">Đơn giá</th><th class="num">SL</th><th class="num">Thành tiền</th></tr></thead>
        <tbody>${inv.items.map((it) => `
          <tr><td>${esc(it.product_name)}</td><td class="num">${money(it.unit_price)}</td>
              <td class="num">${it.quantity}</td><td class="num">${money(it.line_total)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="cart-total">Tổng cộng: <strong>${money(inv.total)}</strong></div>`;
    $('#inv-dialog').showModal();
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ---------- Khởi động ----------
showTab('dashboard');
