const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Inicializar Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Configurar multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/products');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, unique + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato no permitido'), false);
        }
    }
});

// Subir imagen a Supabase Storage
async function uploadToSupabase(file, folder = 'products') {
    try {
        const filePath = `${folder}/${file.filename}`;
        const fileBuffer = fs.readFileSync(file.path);
        
        const { data, error } = await supabase.storage
            .from('catalog')
            .upload(filePath, fileBuffer, {
                contentType: file.mimetype,
                cacheControl: '3600'
            });

        if (error) throw error;

        const { data: urlData } = supabase.storage
            .from('catalog')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Error al subir a Supabase:', error);
        return `/uploads/products/${file.filename}`;
    }
}

// Ruta: Subir imagen de producto
router.post('/product-image', upload.single('image'), async (req, res) => {
    try {
        const { product_id } = req.body;
        if (!product_id) {
            throw new Error('product_id es requerido');
        }
        if (!req.file) {
            throw new Error('No se recibió ninguna imagen');
        }

        const imageUrl = await uploadToSupabase(req.file);

        const { data, error } = await supabase
            .from('product_images')
            .insert({
                product_id: Number(product_id),
                image_url: imageUrl,
                is_primary: true
            })
            .select()
            .single();

        if (error) throw error;

        await supabase
            .from('products')
            .update({ image_url: imageUrl })
            .eq('id', Number(product_id));

        res.json({ success: true, image_url: imageUrl, data });

    } catch (error) {
        console.error('Error en upload:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;