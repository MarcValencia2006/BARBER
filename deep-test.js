const axios = require('axios');
const API_URL = 'http://localhost:3000/api';
let pass = 0, fail = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`✅ ${name} - PASS`);
        pass++;
    } catch (e) {
        console.log(`❌ ${name} - FAIL`);
        console.log(`   ${e.message}`);
        fail++;
    }
}

async function run() {
    console.log('🔬 PRUEBAS PROFUNDAS (API + FLUJO COMPLETO)\n');

    const timestamp = Date.now();
    const testSku = `TEST-${timestamp}`;

    let testProductId = null;

    // 1. Crear producto con SKU único
    await test('Crear producto', async () => {
        const res = await axios.post(`${API_URL}/products`, {
            name: 'Producto Test Deep',
            sku: testSku,
            category: 'Pruebas',
            purchase_price: 10,
            sale_price: 20,
            min_stock: 1,
            initial_stock: 5,
            branch_code: 'TIENDA'
        });
        if (!res.data.id) throw new Error('No devolvió ID');
        testProductId = res.data.id;
        console.log(`   Producto creado con ID: ${testProductId}`);
    });

    // 2. Editar producto
    await test('Editar producto', async () => {
        await axios.put(`${API_URL}/products/${testProductId}`, {
            name: 'Producto Test Editado',
            sku: testSku,
            category: 'Pruebas',
            purchase_price: 15,
            sale_price: 25,
            min_stock: 2,
            image_url: null
        });
        const check = await axios.get(`${API_URL}/products/${testProductId}`);
        if (check.data.name !== 'Producto Test Editado') throw new Error('Nombre no actualizado');
        if (Number(check.data.sale_price) !== 25) throw new Error('Precio no actualizado');
    });

    // 3. Ajustar stock
    await test('Ajustar stock', async () => {
        await axios.patch(`${API_URL}/products/${testProductId}/stock`, {
            branch_code: 'TIENDA',
            quantity: 10,
            reason: 'Prueba ajuste',
            user_name: 'Test'
        });
        const check = await axios.get(`${API_URL}/products/${testProductId}`);
        const stock = check.data.stock_by_branch?.TIENDA || 0;
        if (stock != 15) throw new Error(`Stock esperado 15, obtenido ${stock}`);
    });

    // 4. Buscar producto por nombre
    await test('Buscar producto por nombre', async () => {
        const res = await axios.get(`${API_URL}/products/search?q=Test&limit=10`);
        const found = res.data.find(p => p.id == testProductId);
        if (!found) throw new Error('Producto no encontrado en búsqueda');
    });

    // 5. Vender 1 unidad
    let saleId = null;
    await test('Vender 1 unidad', async () => {
        const res = await axios.post(`${API_URL}/sales`, {
            branch_code: 'TIENDA',
            seller_name: 'TestDeep',
            payment_method: 'Efectivo',
            discount: 0,
            items: [{ product_id: testProductId, quantity: 1, unit_price: 25 }]
        });
        saleId = res.data.id;
        if (!saleId) throw new Error('Venta no creada');
        console.log(`   Venta creada ID: ${saleId}`);
    });

    // 6. Verificar stock después de venta
    await test('Stock descontado correctamente', async () => {
        const check = await axios.get(`${API_URL}/products/${testProductId}`);
        const stock = check.data.stock_by_branch?.TIENDA || 0;
        if (stock != 14) throw new Error(`Stock esperado 14, obtenido ${stock}`);
    });

    // 7. Verificar movimiento
    await test('Movimiento registrado', async () => {
        const res = await axios.get(`${API_URL}/movements`);
        const found = res.data.find(m => m.sale_id == saleId && m.type === 'Salida por Venta');
        if (!found) throw new Error('Movimiento no encontrado');
        if (found.quantity != 1) throw new Error('Cantidad incorrecta');
    });

    // 8. Verificar historial de ventas
    await test('Venta en historial', async () => {
        const res = await axios.get(`${API_URL}/sales`);
        const found = res.data.find(s => s.id == saleId);
        if (!found) throw new Error('Venta no encontrada');
        if (Number(found.total) !== 25) throw new Error(`Total incorrecto: ${found.total}`);
    });

    // 9. Desactivar producto (limpieza)
    await test('Desactivar producto', async () => {
        await axios.put(`${API_URL}/products/${testProductId}`, {
            name: 'Producto Test Editado',
            sku: testSku,
            category: 'Pruebas',
            purchase_price: 15,
            sale_price: 25,
            min_stock: 2,
            status: 'Inactivo'
        });
        // Verificar que quedó inactivo
        const check = await axios.get(`${API_URL}/products/${testProductId}`);
        if (check.data.status !== 'Inactivo') {
            throw new Error('El producto no se desactivó correctamente');
        }
    });

    console.log(`\n📊 RESULTADOS: ${pass} exitosas, ${fail} fallidas`);
    if (fail === 0) {
        console.log('✅ ¡TODAS LAS PRUEBAS PASARON!');
    } else {
        console.log('❌ Algunas pruebas fallaron. Revisa los mensajes de error.');
    }
}

run().catch(console.error);