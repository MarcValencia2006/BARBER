const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Generar catálogo
router.post('/generate', async (req, res) => {
    try {
        const { data: products, error } = await supabase
            .from('products')
            .select(`
                id, sku, name, description, category, brand,
                sale_price, purchase_price, min_stock, image_url,
                inventory ( branch_id, quantity )
            `)
            .eq('is_active', true)
            .order('category')
            .order('name');

        if (error) throw error;

        const catalog = products.map(p => {
            const totalStock = p.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;
            return { ...p, total_stock: totalStock, inventory: undefined };
        });

        const version = `v${Date.now()}`;
        const filePath = path.join(__dirname, '../../catalog/data.json');
        
        const catalogDir = path.join(__dirname, '../../catalog');
        if (!fs.existsSync(catalogDir)) {
            fs.mkdirSync(catalogDir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2));

        await supabase
            .from('catalog_versions')
            .insert({
                version,
                product_count: catalog.length,
                file_url: '/catalog/data.json'
            });

        res.json({
            success: true,
            version,
            count: catalog.length,
            url: '/catalog/data.json'
        });

    } catch (error) {
        console.error('Error al generar catálogo:', error);
        res.status(500).json({ error: error.message });
    }
});

// Descargar catálogo en PDF
router.post('/download', async (req, res) => {
    try {
        const { products } = req.body;
        if (!products || products.length === 0) {
            throw new Error('No hay productos para el catálogo');
        }

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=catalogo-barber-stock.pdf');
            res.send(pdfBuffer);
        });

        doc.fontSize(24)
           .text('Catálogo Barber Stock', { align: 'center' })
           .moveDown();

        doc.fontSize(12)
           .text(`Generado: ${new Date().toLocaleDateString('es-BO')}`, { align: 'center' })
           .text(`Total: ${products.length} productos`, { align: 'center' })
           .moveDown(2);

        const grouped = products.reduce((acc, p) => {
            const cat = p.category || 'Sin categoría';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(p);
            return acc;
        }, {});

        for (const [category, items] of Object.entries(grouped)) {
            doc.fontSize(16)
               .text(`📂 ${category}`, { underline: true })
               .moveDown(0.5);

            items.forEach((p, index) => {
                doc.fontSize(10)
                   .text(`${index + 1}. ${p.name}`)
                   .text(`   SKU: ${p.sku} | Precio: Bs ${p.sale_price?.toFixed(2) || '0.00'}`, { indent: 10 })
                   .moveDown(0.3);
            });

            doc.moveDown(1);
        }

        doc.fontSize(8)
           .text('Catálogo generado automáticamente - Barber Stock', { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('Error al generar PDF:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;