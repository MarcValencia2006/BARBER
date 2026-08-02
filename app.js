const BRANCHES = ["PUCARANI", "UPEA", "BALLIVIAN", "TIENDA"];
const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:3000/api"
  : "/api";
const money = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" });

let products = [];
let sales = [];
let movements = [];
let cart = [];

const els = {
  branchSelect: document.querySelector("#branchSelect"),
  chipStock: document.querySelector("#chipStock"),
  chipVentas: document.querySelector("#chipVentas"),
  metricValue: document.querySelector("#metricValue"),
  metricLow: document.querySelector("#metricLow"),
  metricOut: document.querySelector("#metricOut"),
  metricProfit: document.querySelector("#metricProfit"),
  branchSummary: document.querySelector("#branchSummary"),
  alertRows: document.querySelector("#alertRows"),
  productForm: document.querySelector("#productForm"),
  inventorySearch: document.querySelector("#inventorySearch"),
  inventoryRows: document.querySelector("#inventoryRows"),
  saleSearch: document.querySelector("#saleSearch"),
  saleQty: document.querySelector("#saleQty"),
  cartRows: document.querySelector("#cartRows"),
  sellerName: document.querySelector("#sellerName"),
  customerName: document.querySelector("#customerName"),
  paymentMethod: document.querySelector("#paymentMethod"),
  discountInput: document.querySelector("#discountInput"),
  subtotalText: document.querySelector("#subtotalText"),
  discountText: document.querySelector("#discountText"),
  totalText: document.querySelector("#totalText"),
  salesRows: document.querySelector("#salesRows"),
  movementRows: document.querySelector("#movementRows"),
  toast: document.querySelector("#toast"),
};

// NAVEGACIÓN
document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.view}`).classList.add("active");
  });
});

document.querySelector("#refreshBtn").addEventListener("click", loadData);
document.querySelector("#addToCart").addEventListener("click", addToCart);
document.querySelector("#confirmSale").addEventListener("click", confirmSale);
els.branchSelect.addEventListener("change", render);
els.inventorySearch.addEventListener("input", renderInventory);
els.discountInput.addEventListener("input", renderCart);

// ============================================
// FORMULARIO DE PRODUCTO CON IMAGEN
// ============================================
els.productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const branch = selectedBranch() === "TODAS" ? "TIENDA" : selectedBranch();

  const imageFile = document.querySelector("#productImage")?.files[0];

  const payload = {
    name: document.querySelector("#productName").value.trim(),
    sku: document.querySelector("#productSku").value.trim().toUpperCase(),
    barcode: document.querySelector("#productBarcode").value.trim() || null,
    qr_code: document.querySelector("#productQr").value.trim() || null,
    category: document.querySelector("#productCategory").value,
    brand: document.querySelector("#productBrand").value.trim() || null,
    provider: document.querySelector("#productProvider").value.trim() || null,
    purchase_price: Number(document.querySelector("#buyPrice").value || 0),
    sale_price: Number(document.querySelector("#sellPrice").value || 0),
    min_stock: Number(document.querySelector("#minStock").value || 0),
    initial_stock: Number(document.querySelector("#initialStock").value || 0),
    branch_code: branch,
  };

  try {
    const productResult = await request("/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (imageFile && productResult.id) {
      const formData = new FormData();
      formData.append('product_id', productResult.id);
      formData.append('image', imageFile);
      await fetch(`${API_BASE}/upload/product-image`, {
        method: 'POST',
        body: formData,
      });
    }

    els.productForm.reset();
    setDefaultProductValues();
    document.querySelector("#imagePreview").style.display = 'none';
    showToast("Producto guardado en la base de datos");
    await loadData();
  } catch (error) {
    showToast(error.message);
  }
});

// Previsualizar imagen
document.addEventListener('change', function(e) {
  if (e.target.id === 'productImage') {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(event) {
        const preview = document.querySelector('#previewImg');
        const container = document.querySelector('#imagePreview');
        if (preview && container) {
          preview.src = event.target.result;
          container.style.display = 'block';
        }
      };
      reader.readAsDataURL(file);
    }
  }
});

// ============================================
// CARGA DE DATOS
// ============================================
async function loadData() {
  try {
    const [productData, saleData, movementData] = await Promise.all([
      request("/products"),
      request("/sales"),
      request("/movements"),
    ]);

    products = productData;
    sales = saleData;
    movements = movementData;
    render();
    setTimeout(updateFilters, 100);
  } catch (error) {
    showToast("No se pudo conectar con la API");
    render();
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Error inesperado");
  return data;
}

function selectedBranch() {
  return els.branchSelect.value;
}

function setDefaultProductValues() {
  document.querySelector("#buyPrice").value = 0;
  document.querySelector("#sellPrice").value = 0;
  document.querySelector("#minStock").value = 0;
  document.querySelector("#initialStock").value = 0;
}

function productStock(product, branch = selectedBranch()) {
  if (branch === "TODAS") return BRANCHES.reduce((sum, item) => sum + Number(product.stock[item] || 0), 0);
  return Number(product.stock[branch] || 0);
}

function visibleProducts() {
  const term = els.inventorySearch.value.trim().toLowerCase();
  const categoryFilter = document.getElementById('filterCategory')?.value || '';
  const brandFilter = document.getElementById('filterBrand')?.value || '';

  return products.filter((product) => {
    const matchesBranch = selectedBranch() === "TODAS" || productStock(product) > 0;
    const matchesTerm = [product.name, product.sku, product.category, product.barcode, product.qr_code].some((value) =>
      String(value || "").toLowerCase().includes(term)
    );
    const matchesCategory = !categoryFilter || product.category === categoryFilter;
    const matchesBrand = !brandFilter || product.brand === brandFilter;
    return matchesBranch && matchesTerm && matchesCategory && matchesBrand;
  });
}

function render() {
  renderMetrics();
  renderBranches();
  renderAlerts();
  renderInventory();
  renderCart();
  renderSales();
  renderMovements();
}

function renderMetrics() {
  const stock = products.reduce((sum, product) => sum + productStock(product), 0);
  const value = products.reduce((sum, product) => sum + productStock(product) * Number(product.sale_price), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((sale) => String(sale.sale_date).startsWith(today));
  const revenue = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const profit = todaySales.reduce((sum, sale) => sum + Number(sale.estimated_profit || 0), 0);
  const alerts = getAlerts();

  els.chipStock.textContent = stock;
  els.chipVentas.textContent = money.format(revenue);
  els.metricValue.textContent = money.format(value);
  els.metricLow.textContent = alerts.filter((item) => item.status === "Bajo").length;
  els.metricOut.textContent = alerts.filter((item) => item.status === "Agotado").length;
  els.metricProfit.textContent = money.format(profit);
}

function renderBranches() {
  els.branchSummary.innerHTML = BRANCHES.map((branch) => {
    const stock = products.reduce((sum, product) => sum + Number(product.stock[branch] || 0), 0);
    const value = products.reduce((sum, product) => sum + Number(product.stock[branch] || 0) * Number(product.sale_price), 0);
    const branchSales = sales.filter((sale) => sale.branch_code === branch).reduce((sum, sale) => sum + Number(sale.total), 0);
    return `
      <article class="branch-card">
        <h3>${branch}</h3>
        <p><span>Stock</span><strong>${stock}</strong></p>
        <p><span>Valor</span><strong>${money.format(value)}</strong></p>
        <p><span>Ventas</span><strong>${money.format(branchSales)}</strong></p>
      </article>
    `;
  }).join("");
}

function getAlerts() {
  return products.flatMap((product) =>
    BRANCHES.map((branch) => {
      const stock = Number(product.stock[branch] || 0);
      return {
        product,
        branch,
        stock,
        min: Number(product.min_stock || 0),
        status: stock === 0 ? "Agotado" : stock <= Number(product.min_stock || 0) ? "Bajo" : "OK",
      };
    })
  ).filter((item) => item.status !== "OK" && (selectedBranch() === "TODAS" || item.branch === selectedBranch()));
}

function renderAlerts() {
  const alerts = getAlerts();
  els.alertRows.innerHTML = alerts.length
    ? alerts.map((item) => `
      <tr>
        <td>${item.product.name}</td>
        <td>${item.product.sku}</td>
        <td>${item.branch}</td>
        <td>${item.stock}</td>
        <td>${item.min}</td>
        <td><span class="badge ${item.status === "Agotado" ? "bad" : "warn"}">${item.status}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">No hay alertas. Cuando cargues productos con stock bajo aparecerán aquí.</td></tr>`;
}

// ============================================
// INVENTARIO CON EDITOR Y AJUSTE DE STOCK
// ============================================
function renderInventory() {
  const rows = visibleProducts();
  els.inventoryRows.innerHTML = rows.length
    ? rows.map((product) => {
      const total = BRANCHES.reduce((sum, branch) => sum + Number(product.stock[branch] || 0), 0);
      return `
        <tr>
          <td style="display: flex; align-items: center; gap: 8px;">
            <img src="${product.image_url || '/placeholder.png'}" 
                 style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px; background: #1a1814;"
                 onerror="this.src='/placeholder.png'">
            ${product.name}
          </td>
          <td>${product.sku}</td>
          <td>${product.category || ""}</td>
          <td>${money.format(product.sale_price)}</td>
          ${BRANCHES.map(branch => `
            <td>
              ${product.stock[branch] || 0}
              <button class="action-link" onclick="adjustStock(${product.id}, '${branch}', ${product.stock[branch] || 0})" 
                      style="font-size: 10px; margin-left: 4px;" title="Ajustar stock">🔧</button>
            </td>
          `).join('')}
          <td><strong>${total}</strong></td>
          <td>
            <button class="action-link" onclick="editProduct(${product.id})" title="Editar producto">✏️</button>
          </td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="${BRANCHES.length + 5}">Inventario vacío. Registra tu primer producto desde el formulario superior.</td></tr>`;
}

// ============================================
// FUNCIONES DE EDICIÓN Y AJUSTE DE STOCK
// ============================================
function createEditModal() {
  const modal = document.createElement('div');
  modal.id = 'editModal';
  modal.style.cssText = `
    display: none;
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0,0,0,0.8);
    z-index: 1000;
    justify-content: center;
    align-items: center;
  `;
  modal.innerHTML = `
    <div style="
      background: var(--panel);
      border: 2px solid var(--gold);
      border-radius: 12px;
      padding: 30px;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    ">
      <h2 style="color: var(--gold); margin-bottom: 20px;">✏️ Editar Producto</h2>
      <form id="editForm" style="display: grid; gap: 12px;">
        <input id="editId" type="hidden">
        <div class="form-group"><label>Nombre *</label><input id="editName" required></div>
        <div class="form-group"><label>SKU *</label><input id="editSku" required></div>
        <div class="form-group"><label>Código de barras</label><input id="editBarcode"></div>
        <div class="form-group"><label>QR</label><input id="editQr"></div>
        <div class="form-group"><label>Categoría</label>
          <select id="editCategory">
            <option>Cabello</option><option>Barba</option>
            <option>Herramientas</option><option>Tratamientos</option>
            <option>Equipos</option><option>Accesorios</option>
            <option>Ceras</option><option>Shampoos</option>
          </select>
        </div>
        <div class="form-group"><label>Marca</label><input id="editBrand"></div>
        <div class="form-group"><label>Proveedor</label><input id="editProvider"></div>
        <div class="form-group"><label>Precio compra</label><input id="editBuyPrice" type="number" step="0.01"></div>
        <div class="form-group"><label>Precio venta</label><input id="editSellPrice" type="number" step="0.01"></div>
        <div class="form-group"><label>Stock mínimo</label><input id="editMinStock" type="number"></div>
        <div class="form-group"><label>URL imagen</label><input id="editImage" placeholder="URL de la imagen"></div>
        <div style="display: flex; gap: 10px; margin-top: 10px;">
          <button type="submit" class="btn-script-main" style="flex:1;">💾 Guardar cambios</button>
          <button type="button" class="btn-normal" id="closeEditModal" style="flex:1;">Cancelar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('closeEditModal').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const payload = {
      name: document.getElementById('editName').value.trim(),
      sku: document.getElementById('editSku').value.trim().toUpperCase(),
      barcode: document.getElementById('editBarcode').value.trim() || null,
      qr_code: document.getElementById('editQr').value.trim() || null,
      category: document.getElementById('editCategory').value,
      brand: document.getElementById('editBrand').value.trim() || null,
      provider: document.getElementById('editProvider').value.trim() || null,
      purchase_price: Number(document.getElementById('editBuyPrice').value || 0),
      sale_price: Number(document.getElementById('editSellPrice').value || 0),
      min_stock: Number(document.getElementById('editMinStock').value || 0),
      image_url: document.getElementById('editImage').value.trim() || null,
    };

    try {
      const response = await fetch(`${API_BASE}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al actualizar');
      }
      showToast('✅ Producto actualizado correctamente');
      modal.style.display = 'none';
      await loadData();
    } catch (error) {
      showToast(error.message);
    }
  });
}

async function editProduct(productId) {
  try {
    const response = await fetch(`${API_BASE}/products/${productId}`);
    if (!response.ok) throw new Error('Producto no encontrado');
    const product = await response.json();

    document.getElementById('editId').value = product.id;
    document.getElementById('editName').value = product.name || '';
    document.getElementById('editSku').value = product.sku || '';
    document.getElementById('editBarcode').value = product.barcode || '';
    document.getElementById('editQr').value = product.qr_code || '';
    document.getElementById('editCategory').value = product.category || 'Cabello';
    document.getElementById('editBrand').value = product.brand || '';
    document.getElementById('editProvider').value = product.provider || '';
    document.getElementById('editBuyPrice').value = product.purchase_price || 0;
    document.getElementById('editSellPrice').value = product.sale_price || 0;
    document.getElementById('editMinStock').value = product.min_stock || 0;
    document.getElementById('editImage').value = product.image_url || '';

    document.getElementById('editModal').style.display = 'flex';
  } catch (error) {
    showToast('Error al cargar el producto: ' + error.message);
  }
}

async function adjustStock(productId, branchCode, currentStock) {
  const newStock = prompt(`Stock actual en ${branchCode}: ${currentStock}\nIngresa el nuevo stock (puede ser negativo para reducir):`, currentStock);
  if (newStock === null) return;

  const quantity = Number(newStock) - currentStock;
  if (isNaN(quantity)) {
    showToast('Cantidad inválida');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/products/${productId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_code: branchCode,
        quantity: quantity,
        reason: 'Ajuste manual desde inventario',
        user_name: 'Administrador'
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al ajustar stock');
    }
    showToast(`✅ Stock ajustado en ${branchCode}`);
    await loadData();
  } catch (error) {
    showToast(error.message);
  }
}

// ============================================
// BÚSQUEDA EN VENTAS CON IMÁGENES
// ============================================
let searchTimeout;
els.saleSearch.addEventListener('input', function() {
  clearTimeout(searchTimeout);
  const term = this.value.trim();
  if (term.length < 2) {
    removeSearchResults();
    return;
  }
  searchTimeout = setTimeout(() => performSearch(term), 300);
});

async function performSearch(term) {
  try {
    const response = await fetch(`${API_BASE}/products/search?q=${encodeURIComponent(term)}&limit=10`);
    if (!response.ok) throw new Error('Error en la búsqueda');
    const results = await response.json();
    showSearchResults(results);
  } catch (error) {
    console.error('Error en búsqueda:', error);
  }
}

function showSearchResults(results) {
  removeSearchResults();

  if (!results || results.length === 0) {
    const container = document.createElement('div');
    container.className = 'search-results';
    container.style.cssText = `
      position: absolute;
      background: var(--panel);
      border: 1px solid var(--gold);
      border-radius: 8px;
      padding: 15px;
      color: var(--muted);
      z-index: 1000;
      min-width: 300px;
    `;
    container.textContent = 'No se encontraron productos';
    const rect = els.saleSearch.getBoundingClientRect();
    container.style.left = rect.left + 'px';
    container.style.top = (rect.bottom + 5) + 'px';
    container.style.width = rect.width + 'px';
    document.body.appendChild(container);
    return;
  }

  const container = document.createElement('div');
  container.className = 'search-results';
  container.style.cssText = `
    position: absolute;
    background: var(--panel);
    border: 1px solid var(--gold);
    border-radius: 8px;
    max-height: 350px;
    overflow-y: auto;
    z-index: 1000;
    min-width: 300px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  `;

  results.forEach(product => {
    const totalStock = product.total_stock || 0;
    const item = document.createElement('div');
    item.style.cssText = `
      display: flex;
      align-items: center;
      padding: 10px 15px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255,215,0,0.1);
      gap: 12px;
      transition: background 0.2s;
    `;
    item.onmouseover = () => item.style.background = 'rgba(255,215,0,0.1)';
    item.onmouseout = () => item.style.background = 'transparent';

    const stockColor = totalStock <= 0 ? '#6f241f' : totalStock <= (product.min_stock || 0) ? '#6f5018' : '#1f6d45';

    item.innerHTML = `
      <img src="${product.image_url || '/placeholder.png'}" 
           style="width: 45px; height: 45px; object-fit: cover; border-radius: 6px; background: #1a1814;"
           onerror="this.src='/placeholder.png'">
      <div style="flex:1;">
        <div style="font-weight: 600; color: var(--gold-soft);">${product.name}</div>
        <div style="font-size: 12px; color: var(--muted);">${product.sku}</div>
        <div style="font-size: 12px; color: var(--gold);">${money.format(product.sale_price)}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 12px; color: var(--muted);">Stock total</div>
        <div style="font-weight: 700; color: ${stockColor};">${totalStock}</div>
      </div>
    `;
    item.addEventListener('click', () => {
      selectProductForSale(product);
      container.remove();
    });
    container.appendChild(item);
  });

  const rect = els.saleSearch.getBoundingClientRect();
  container.style.left = rect.left + 'px';
  container.style.top = (rect.bottom + 5) + 'px';
  container.style.width = rect.width + 'px';
  document.body.appendChild(container);
}

function selectProductForSale(product) {
  els.saleSearch.value = product.name;
  const found = products.find(p => p.id === product.id);
  if (found) {
    const priceInput = document.querySelector('#salePrice');
    if (priceInput) priceInput.value = found.sale_price;
    const branch = selectedBranch();
    if (branch !== 'TODAS') {
      const stock = found.stock?.[branch] || 0;
      showToast(`📦 Stock en ${branch}: ${stock} unidades`);
    }
    // Agregar automáticamente al carrito
    setTimeout(() => {
      addToCart();
    }, 300);
  }
}

function removeSearchResults() {
  const existing = document.querySelector('.search-results');
  if (existing) existing.remove();
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-results') && !e.target.closest('#saleSearch')) {
    removeSearchResults();
  }
});

// ============================================
// FILTROS EN INVENTARIO
// ============================================
function updateFilters() {
  const searchBox = document.querySelector('.search-box');
  if (!searchBox) return;
  if (document.getElementById('filterCategory')) return;

  const filtersDiv = document.createElement('div');
  filtersDiv.style.cssText = `
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 10px;
  `;
  
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

  filtersDiv.innerHTML = `
    <select id="filterCategory" style="padding: 6px 12px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); color: var(--text);">
      <option value="">Todas las categorías</option>
      ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
    </select>
    <select id="filterBrand" style="padding: 6px 12px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); color: var(--text);">
      <option value="">Todas las marcas</option>
      ${brands.map(b => `<option value="${b}">${b}</option>`).join('')}
    </select>
    <button id="clearFilters" class="btn-normal" style="padding: 6px 16px;">Limpiar filtros</button>
  `;
  searchBox.parentNode.insertBefore(filtersDiv, searchBox.nextSibling);

  document.getElementById('filterCategory').addEventListener('change', renderInventory);
  document.getElementById('filterBrand').addEventListener('change', renderInventory);
  document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterBrand').value = '';
    document.getElementById('inventorySearch').value = '';
    renderInventory();
  });
}

// ============================================
// CARRITO Y VENTAS
// ============================================
function addToCart() {
  const branch = selectedBranch();
  if (branch === "TODAS") {
    showToast("Selecciona una sucursal para vender");
    return;
  }

  const term = els.saleSearch.value.trim().toLowerCase();
  const qty = Number(els.saleQty.value || 1);
  const product = products.find((item) =>
    [item.name, item.sku, item.barcode, item.qr_code].some((value) => String(value || "").toLowerCase().includes(term))
  );

  if (!product) {
    showToast("Producto no encontrado");
    return;
  }

  const currentQty = cart.find((item) => item.product_id === product.id)?.quantity || 0;
  if (Number(product.stock[branch] || 0) < currentQty + qty) {
    showToast("Stock insuficiente en la sucursal");
    return;
  }

  const overrideValue = document.querySelector("#salePrice").value;
  const appliedPrice = overrideValue === "" ? Number(product.sale_price) : Number(overrideValue);
  const priceWasChanged = appliedPrice !== Number(product.sale_price);
  const reason = document.querySelector("#priceReason").value.trim();
  const authorizedBy = document.querySelector("#authorizedBy").value.trim();

  if (priceWasChanged && (!reason || !authorizedBy)) {
    showToast("Indica motivo y usuario que autoriza el cambio de precio");
    return;
  }

  const existing = cart.find((item) => item.product_id === product.id);
  if (existing) existing.quantity += qty;
  else {
    cart.push({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      quantity: qty,
      unit_price: appliedPrice,
      original_price: Number(product.sale_price),
      price_change_reason: priceWasChanged ? reason : null,
      authorized_by: priceWasChanged ? authorizedBy : null,
    });
  }

  els.saleSearch.value = "";
  els.saleQty.value = 1;
  document.querySelector("#salePrice").value = "";
  document.querySelector("#priceReason").value = "";
  document.querySelector("#authorizedBy").value = "";
  renderCart();
}

function renderCart() {
  els.cartRows.innerHTML = cart.length
    ? cart.map((item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>${money.format(item.unit_price)}</td>
        <td>${money.format(item.unit_price * item.quantity)}</td>
        <td><button class="action-link" onclick="removeFromCart(${item.product_id})">Quitar</button></td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Agrega productos para iniciar la venta.</td></tr>`;

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const discount = Math.min(Number(els.discountInput.value || 0), subtotal);
  els.subtotalText.textContent = money.format(subtotal);
  els.discountText.textContent = money.format(discount);
  els.totalText.textContent = money.format(subtotal - discount);
}

function removeFromCart(id) {
  cart = cart.filter((item) => item.product_id !== id);
  renderCart();
}

async function confirmSale() {
  const branch = selectedBranch();
  if (branch === "TODAS") {
    showToast("Selecciona una sucursal para confirmar");
    return;
  }

  if (!cart.length) {
    showToast("El carrito está vacío");
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const discount = Math.min(Number(els.discountInput.value || 0), subtotal);

  try {
    await request("/sales", {
      method: "POST",
      body: JSON.stringify({
        branch_code: branch,
        seller_name: els.sellerName.value || "Vendedor",
        customer_name: els.customerName.value || null,
        payment_method: els.paymentMethod.value,
        discount,
        observations: "",
        items: cart,
      }),
    });

    cart = [];
    els.discountInput.value = 0;
    showToast("Venta confirmada y stock descontado");
    await loadData();
  } catch (error) {
    showToast(error.message);
  }
}

function renderSales() {
  els.salesRows.innerHTML = sales.length
    ? sales.map((sale) => `
      <tr>
        <td>${sale.sale_number}</td>
        <td>${formatDate(sale.sale_date)}</td>
        <td>${sale.branch_code}</td>
        <td>${sale.seller_name}</td>
        <td>${money.format(sale.total)}</td>
        <td>${sale.payment_method}</td>
        <td><span class="badge good">${sale.status}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">Todavía no hay ventas registradas.</td></tr>`;
}

function renderMovements() {
  els.movementRows.innerHTML = movements.length
    ? movements.map((movement) => `
      <tr>
        <td>${formatDate(movement.created_at)}</td>
        <td>${movement.type}</td>
        <td>${movement.product_name}</td>
        <td>${movement.branch_code}</td>
        <td>${movement.quantity}</td>
        <td>${movement.user_name || "Sistema"}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">Sin movimientos registrados.</td></tr>`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-BO");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3000);
}

// ============================================
// INICIALIZACIÓN
// ============================================
window.removeFromCart = removeFromCart;
window.editProduct = editProduct;
window.adjustStock = adjustStock;

createEditModal();
setDefaultProductValues();
loadData();
setInterval(loadData, 10000);

