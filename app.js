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

els.productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const branch = selectedBranch() === "TODAS" ? "TIENDA" : selectedBranch();

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
    await request("/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    els.productForm.reset();
    setDefaultProductValues();
    showToast("Producto guardado en la base de datos");
    await loadData();
  } catch (error) {
    showToast(error.message);
  }
});

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
  return products.filter((product) => {
    const matchesBranch = selectedBranch() === "TODAS" || productStock(product) > 0;
    const matchesTerm = [product.name, product.sku, product.category, product.barcode, product.qr_code].some((value) =>
      String(value || "").toLowerCase().includes(term)
    );
    return matchesBranch && matchesTerm;
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

function renderInventory() {
  const rows = visibleProducts();
  els.inventoryRows.innerHTML = rows.length
    ? rows.map((product) => {
      const total = BRANCHES.reduce((sum, branch) => sum + Number(product.stock[branch] || 0), 0);
      return `
        <tr>
          <td>${product.name}</td>
          <td>${product.sku}</td>
          <td>${product.category || ""}</td>
          <td>${money.format(product.sale_price)}</td>
          <td>${product.stock.PUCARANI || 0}</td>
          <td>${product.stock.UPEA || 0}</td>
          <td>${product.stock.BALLIVIAN || 0}</td>
          <td>${product.stock.TIENDA || 0}</td>
          <td><strong>${total}</strong></td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="9">Inventario vacío. Registra tu primer producto desde el formulario superior.</td></tr>`;
}

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

window.removeFromCart = removeFromCart;
setDefaultProductValues();
loadData();
setInterval(loadData, 10000);
