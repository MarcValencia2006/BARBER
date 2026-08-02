const path = require("path");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

// ============================================
// NUEVAS RUTAS - IMPORTAR
// ============================================
const uploadRoutes = require('./routes/upload');
const catalogRoutes = require('./routes/catalog');
const productsRoutes = require('./routes/products'); // <--- NUEVO: tu products.js con edición y ajuste

// ============================================

const app = express();
const port = Number(process.env.PORT || 3000);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

// ============================================
// NUEVO: Servir archivos subidos (imágenes)
// ============================================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================

app.get("/api/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    next(error);
  }
});

// ============================================
// RUTAS DE PRODUCTOS - NUEVAS (edición, ajuste, búsqueda)
// ============================================
app.use('/api/products', productsRoutes);

// ============================================
// RUTAS DE PRODUCTOS - LEGACY (tus rutas originales, renombradas)
// ============================================
app.get("/api/products-legacy", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.sku,
        p.barcode,
        p.qr_code,
        p.name,
        p.description,
        p.category,
        p.brand,
        p.provider,
        p.purchase_price,
        p.sale_price,
        p.min_stock,
        p.max_stock,
        p.unit,
        p.image_url,
        p.status,
        COALESCE(SUM(CASE WHEN b.code = 'PUCARANI' THEN i.quantity ELSE 0 END), 0) AS "PUCARANI",
        COALESCE(SUM(CASE WHEN b.code = 'UPEA' THEN i.quantity ELSE 0 END), 0) AS "UPEA",
        COALESCE(SUM(CASE WHEN b.code = 'BALLIVIAN' THEN i.quantity ELSE 0 END), 0) AS "BALLIVIAN",
        COALESCE(SUM(CASE WHEN b.code = 'TIENDA' THEN i.quantity ELSE 0 END), 0) AS "TIENDA"
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      LEFT JOIN branches b ON b.id = i.branch_id
      WHERE p.status = 'Activo'
      GROUP BY p.id
      ORDER BY p.name ASC
    `);

    res.json(rows.map((row) => ({
      ...row,
      stock: {
        PUCARANI: Number(row.PUCARANI || 0),
        UPEA: Number(row.UPEA || 0),
        BALLIVIAN: Number(row.BALLIVIAN || 0),
        TIENDA: Number(row.TIENDA || 0),
      },
    })));
  } catch (error) {
    next(error);
  }
});

app.post("/api/products-legacy", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      sku,
      barcode = null,
      qr_code = null,
      name,
      description = null,
      category = null,
      brand = null,
      provider = null,
      purchase_price = 0,
      sale_price = 0,
      min_stock = 0,
      max_stock = null,
      unit = "Unidad",
      image_url = null,
      initial_stock = 0,
      branch_code = "TIENDA",
    } = req.body;

    if (!sku || !name) throw httpError(400, "El producto necesita nombre y SKU.");

    await client.query("BEGIN");
    const productResult = await client.query(
      `INSERT INTO products
        (sku, barcode, qr_code, name, description, category, brand, provider, purchase_price, sale_price, min_stock, max_stock, unit, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [sku, barcode, qr_code, name, description, category, brand, provider, purchase_price, sale_price, min_stock, max_stock, unit, image_url]
    );

    const productId = productResult.rows[0].id;
    const branches = await client.query("SELECT id, code FROM branches");

    for (const branch of branches.rows) {
      const quantity = branch.code === branch_code ? Number(initial_stock || 0) : 0;
      await client.query(
        "INSERT INTO inventory (product_id, branch_id, quantity) VALUES ($1, $2, $3)",
        [productId, branch.id, quantity]
      );

      if (quantity > 0) {
        await client.query(
          `INSERT INTO inventory_movements (product_id, branch_id, type, quantity, user_name, reason)
           VALUES ($1, $2, 'Entrada Inicial', $3, 'Sistema', 'Carga inicial de producto')`,
          [productId, branch.id, quantity]
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ id: productId });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ya existe un producto con ese SKU, código de barras o QR." });
    }
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// RESTO DE RUTAS (ventas, movimientos, devoluciones) - SIN CAMBIOS
// ============================================

app.get("/api/sales", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, b.code AS branch_code
      FROM sales s
      JOIN branches b ON b.id = s.branch_id
      ORDER BY s.sale_date DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sales", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      branch_code,
      seller_name,
      customer_name = null,
      payment_method,
      discount = 0,
      observations = null,
      items = [],
    } = req.body;

    if (!branch_code || !seller_name || !payment_method || !items.length) {
      throw httpError(400, "La venta necesita sucursal, vendedor, método de pago y productos.");
    }

    await client.query("BEGIN");

    const branchResult = await client.query("SELECT id FROM branches WHERE code = $1", [branch_code]);
    const branch = branchResult.rows[0];
    if (!branch) throw httpError(404, "Sucursal no encontrada.");

    let subtotal = 0;
    let estimatedProfit = 0;
    const saleItems = [];

    for (const item of items) {
      const productResult = await client.query(
        `SELECT p.id, p.name, p.purchase_price, p.sale_price, i.quantity
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         WHERE p.id = $1 AND i.branch_id = $2
         FOR UPDATE`,
        [item.product_id, branch.id]
      );

      const product = productResult.rows[0];
      if (!product) throw httpError(404, "Producto no encontrado.");
      if (Number(product.quantity) < Number(item.quantity)) {
        throw httpError(409, `Stock insuficiente para ${product.name}.`);
      }

      const unitPrice = Number(item.unit_price);
      const quantity = Number(item.quantity);
      subtotal += unitPrice * quantity;
      estimatedProfit += (unitPrice - Number(product.purchase_price)) * quantity;
      saleItems.push({ ...item, product, unitPrice, quantity });
    }

    const safeDiscount = Math.min(Number(discount || 0), subtotal);
    const total = subtotal - safeDiscount;
    const saleNumber = await createSaleNumber(client);

    const saleResult = await client.query(
      `INSERT INTO sales
        (sale_number, branch_id, seller_name, customer_name, subtotal, discount, tax, total, payment_method, status, observations, estimated_profit)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, 'Completada', $9, $10)
       RETURNING id`,
      [saleNumber, branch.id, seller_name, customer_name, subtotal, safeDiscount, total, payment_method, observations, estimatedProfit]
    );

    const saleId = saleResult.rows[0].id;

    for (const item of saleItems) {
      await client.query(
        `INSERT INTO sale_items
          (sale_id, product_id, quantity, original_price, applied_price, final_price, price_change_reason, authorized_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          saleId,
          item.product_id,
          item.quantity,
          item.original_price || item.product.sale_price,
          item.unitPrice,
          item.unitPrice * item.quantity,
          item.price_change_reason || null,
          item.authorized_by || null,
        ]
      );

      await client.query(
        "UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2 AND branch_id = $3",
        [item.quantity, item.product_id, branch.id]
      );

      await client.query(
        `INSERT INTO inventory_movements (product_id, branch_id, sale_id, type, quantity, user_name, reason)
         VALUES ($1, $2, $3, 'Salida por Venta', $4, $5, $6)`,
        [item.product_id, branch.id, saleId, item.quantity, seller_name, `Venta ${saleNumber}`]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ id: saleId, sale_number: saleNumber });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/movements", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, p.name AS product_name, b.code AS branch_code
      FROM inventory_movements m
      JOIN products p ON p.id = m.product_id
      JOIN branches b ON b.id = m.branch_id
      ORDER BY m.created_at DESC
      LIMIT 300
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/returns", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { sale_id, product_id, branch_code, quantity, reason, approved_by } = req.body;
    if (!sale_id || !product_id || !branch_code || !quantity || !reason || !approved_by) {
      throw httpError(400, "La devolución necesita venta, producto, sucursal, cantidad, motivo y aprobación.");
    }

    await client.query("BEGIN");
    const branchResult = await client.query("SELECT id FROM branches WHERE code = $1", [branch_code]);
    const branch = branchResult.rows[0];
    if (!branch) throw httpError(404, "Sucursal no encontrada.");

    await client.query(
      `INSERT INTO returns (sale_id, product_id, branch_id, quantity, reason, approved_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Aprobada')`,
      [sale_id, product_id, branch.id, quantity, reason, approved_by]
    );
    await client.query(
      "UPDATE inventory SET quantity = quantity + $1 WHERE product_id = $2 AND branch_id = $3",
      [quantity, product_id, branch.id]
    );
    await client.query(
      `INSERT INTO inventory_movements (product_id, branch_id, sale_id, type, quantity, user_name, reason)
       VALUES ($1, $2, $3, 'Entrada por Devolución', $4, $5, $6)`,
      [product_id, branch.id, sale_id, quantity, approved_by, reason]
    );

    await client.query("COMMIT");
    res.status(201).json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

// ============================================
// NUEVAS RUTAS - IMÁGENES Y CATÁLOGO
// ============================================

// Ruta para subir imágenes de productos
app.use('/api/upload', uploadRoutes);

// Ruta para generar y descargar catálogo
app.use('/api/catalog', catalogRoutes);

// Ruta para el catálogo público (HTML)
app.get('/catalog', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'catalog', 'index.html'));
});

// ============================================

async function createSaleNumber(client) {
  const { rows } = await client.query("SELECT COUNT(*) + 1 AS next_number FROM sales");
  return `V-${String(rows[0].next_number).padStart(6, "0")}`;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : "Error interno del servidor." });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

app.listen(port, () => {
  console.log(`Sistema de inventario activo en http://localhost:${port}`);
});