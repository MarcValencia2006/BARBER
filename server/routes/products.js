const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ============================================
// 1. RUTA: Obtener todos los productos (con stock)
// ============================================
router.get('/', async (req, res, next) => {
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

// ============================================
// 2. RUTA DE BÚSQUEDA (DEBE IR ANTES DE /:id)
// ============================================
router.get('/search', async (req, res, next) => {
    try {
        const { q, limit = 20 } = req.query;
        
        if (!q || q.length < 2) {
            return res.json([]);
        }

        const { rows } = await pool.query(`
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.category,
                p.brand,
                p.sale_price,
                p.image_url,
                p.min_stock,
                COALESCE(SUM(i.quantity), 0) AS total_stock
            FROM products p
            LEFT JOIN inventory i ON i.product_id = p.id
            WHERE p.status = 'Activo'
              AND (
                p.name ILIKE $1 OR 
                p.sku ILIKE $1 OR 
                p.barcode ILIKE $1 OR 
                p.qr_code ILIKE $1
              )
            GROUP BY p.id
            ORDER BY p.name ASC
            LIMIT $2
        `, [`%${q}%`, Number(limit)]);

        res.json(rows);
    } catch (error) {
        next(error);
    }
});

// ============================================
// 3. RUTA: Crear un nuevo producto (POST)
// ============================================
router.post('/', async (req, res, next) => {
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

        if (!sku || !name) {
            throw { status: 400, message: 'Nombre y SKU son requeridos' };
        }

        await client.query('BEGIN');

        // Insertar producto
        const productResult = await client.query(
            `INSERT INTO products
                (sku, barcode, qr_code, name, description, category, brand, provider,
                 purchase_price, sale_price, min_stock, max_stock, unit, image_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING id`,
            [sku, barcode, qr_code, name, description, category, brand, provider,
             purchase_price, sale_price, min_stock, max_stock, unit, image_url]
        );

        const productId = productResult.rows[0].id;

        // Asignar stock inicial (si se especifica)
        if (initial_stock > 0) {
            const branchResult = await client.query('SELECT id FROM branches WHERE code = $1', [branch_code]);
            if (branchResult.rows.length === 0) {
                throw { status: 404, message: `Sucursal ${branch_code} no encontrada` };
            }
            const branchId = branchResult.rows[0].id;

            await client.query(
                `INSERT INTO inventory (product_id, branch_id, quantity)
                 VALUES ($1, $2, $3)`,
                [productId, branchId, initial_stock]
            );

            await client.query(
                `INSERT INTO inventory_movements
                    (product_id, branch_id, type, quantity, user_name, reason)
                 VALUES ($1, $2, 'Entrada Inicial', $3, 'Sistema', 'Carga inicial')`,
                [productId, branchId, initial_stock]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ id: productId });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un producto con ese SKU, código de barras o QR.' });
        }
        next(error);
    } finally {
        client.release();
    }
});

// ============================================
// 4. RUTA: Obtener un producto por ID (PARA EDITAR)
// ============================================
router.get('/:id', async (req, res, next) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                p.*,
                jsonb_object_agg(b.code, COALESCE(i.quantity, 0)) AS stock_by_branch
            FROM products p
            LEFT JOIN inventory i ON i.product_id = p.id
            LEFT JOIN branches b ON b.id = i.branch_id
            WHERE p.id = $1
            GROUP BY p.id
        `, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
});

// ============================================
// 5. RUTA: Actualizar producto completo
// ============================================
router.put('/:id', async (req, res, next) => {
    const client = await pool.connect();
    try {
        const {
            name, sku, barcode, qr_code, description, category,
            brand, provider, purchase_price, sale_price, min_stock,
            max_stock, unit, image_url, status
        } = req.body;

        if (!name || !sku) {
            throw { status: 400, message: 'Nombre y SKU son requeridos' };
        }

        await client.query('BEGIN');

        // Construir consulta dinámica para incluir solo los campos enviados
        const fields = [];
        const values = [];
        let paramIndex = 1;

        const addField = (field, value) => {
            if (value !== undefined) {
                fields.push(`${field} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        };

        addField('name', name);
        addField('sku', sku);
        addField('barcode', barcode);
        addField('qr_code', qr_code);
        addField('description', description);
        addField('category', category);
        addField('brand', brand);
        addField('provider', provider);
        addField('purchase_price', purchase_price);
        addField('sale_price', sale_price);
        addField('min_stock', min_stock);
        addField('max_stock', max_stock);
        addField('unit', unit);
        addField('image_url', image_url);
        // Si se envía status, actualizarlo; si no, no tocarlo
        if (status !== undefined) {
            addField('status', status);
        }
        // Siempre actualizar updated_at
        fields.push(`updated_at = NOW()`);

        if (fields.length === 0) {
            throw { status: 400, message: 'No hay campos para actualizar' };
        }

        values.push(req.params.id);
        const query = `
            UPDATE products
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex} AND status = 'Activo'
            RETURNING *
        `;

        const { rows } = await client.query(query, values);

        if (rows.length === 0) {
            // Si no se actualizó porque no existe o está inactivo, intentar sin filtro de status
            const fallbackQuery = `
                UPDATE products
                SET ${fields.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;
            const fallbackResult = await client.query(fallbackQuery, values);
            if (fallbackResult.rows.length === 0) {
                throw { status: 404, message: 'Producto no encontrado' };
            }
            // Si se encontró pero estaba inactivo, actualizar el status a Activo
            if (fallbackResult.rows[0].status !== 'Activo') {
                await client.query(
                    `UPDATE products SET status = 'Activo' WHERE id = $1`,
                    [req.params.id]
                );
                // Reconsultar para devolver el producto actualizado
                const finalResult = await client.query(
                    `SELECT * FROM products WHERE id = $1`,
                    [req.params.id]
                );
                await client.query('COMMIT');
                return res.json(finalResult.rows[0]);
            }
            await client.query('COMMIT');
            return res.json(fallbackResult.rows[0]);
        }

        await client.query('COMMIT');
        res.json(rows[0]);

    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Ya existe un producto con ese SKU' });
        }
        console.error('Error en PUT /:id:', error);
        next(error);
    } finally {
        client.release();
    }
});

// ============================================
// 6. RUTA: Ajustar stock manualmente (PATCH)
// ============================================
router.patch('/:id/stock', async (req, res, next) => {
    const client = await pool.connect();
    try {
        const { branch_code, quantity, reason = 'Ajuste manual', user_name = 'Sistema' } = req.body;

        if (!branch_code || quantity === undefined) {
            throw { status: 400, message: 'Sucursal y cantidad son requeridos' };
        }

        await client.query('BEGIN');

        const branchResult = await client.query('SELECT id FROM branches WHERE code = $1', [branch_code]);
        if (branchResult.rows.length === 0) {
            throw { status: 404, message: 'Sucursal no encontrada' };
        }
        const branchId = branchResult.rows[0].id;

        const { rows } = await client.query(`
            UPDATE inventory 
            SET quantity = quantity + $1, updated_at = NOW()
            WHERE product_id = $2 AND branch_id = $3
            RETURNING quantity
        `, [quantity, req.params.id, branchId]);

        if (rows.length === 0) {
            // Si no existe, crear con la cantidad (si es negativa, se pondrá 0)
            await client.query(`
                INSERT INTO inventory (product_id, branch_id, quantity)
                VALUES ($1, $2, $3)
            `, [req.params.id, branchId, Math.max(0, quantity)]);
        }

        await client.query(`
            INSERT INTO inventory_movements 
                (product_id, branch_id, type, quantity, user_name, reason)
            VALUES ($1, $2, 'Ajuste', $3, $4, $5)
        `, [req.params.id, branchId, quantity, user_name, reason]);

        await client.query('COMMIT');
        res.json({ 
            success: true, 
            message: `Stock ajustado en ${branch_code}`,
            quantity: quantity
        });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
});

module.exports = router;