const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
let passCount = 0;
let failCount = 0;

async function test(name, fn) {
    try {
        const result = await fn();
        console.log(`✅ ${name} - PASS`);
        passCount++;
        return result;
    } catch (error) {
        console.log(`❌ ${name} - FAIL`);
        console.log(`   ${error.message}`);
        failCount++;
        return null;
    }
}

async function runTests() {
    console.log('🔍 INICIANDO PRUEBAS DE CAJA NEGRA (BLACK BOX)');
    console.log('   Simulando flujo completo de venta\n');

    // 1. Health Check
    await test('Health Check', async () => {
        const res = await axios.get(`${API_URL}/health`);
        if (res.data.ok !== true || res.data.database !== 'connected') {
            throw new Error('Respuesta inesperada: ' + JSON.stringify(res.data));
        }
        return true;
    });

    // 2. Obtener lista de productos
    let products = [];
    await test('Listar Productos', async () => {
        const res = await axios.get(`${API_URL}/products`);
        products = res.data;
        if (!Array.isArray(products) || products.length === 0) {
            throw new Error('No se encontraron productos');
        }
        console.log(`   ${products.length} productos disponibles`);
        return true;
    });

    // 3. Buscar productos (funcionalidad de autocompletado)
    await test('Buscar Productos (Bandido)', async () => {
        const res = await axios.get(`${API_URL}/products/search?q=Bandido&limit=5`);
        if (!Array.isArray(res.data) || res.data.length === 0) {
            throw new Error('No se encontraron resultados para "Bandido"');
        }
        console.log(`   ${res.data.length} resultados encontrados`);
        return true;
    });

    // 4. Seleccionar un producto con stock en TIENDA para la prueba
    const branch = 'TIENDA';
    let testProduct = products.find(p => Number(p.stock[branch] || 0) > 0);
    if (!testProduct) {
        console.log('⚠️ No hay productos con stock en TIENDA. La prueba de venta se omitirá.');
    } else {
        console.log(`🧪 Producto de prueba: ${testProduct.name} (ID: ${testProduct.id})`);
        console.log(`   Stock actual en ${branch}: ${testProduct.stock[branch]}`);

        // Guardar stock inicial para validar después
        const initialStock = Number(testProduct.stock[branch] || 0);
        let saleId = null;

        // 5. Crear una venta de prueba (1 unidad, precio 0)
        await test('Crear Venta (1 unidad)', async () => {
            const payload = {
                branch_code: branch,
                seller_name: 'BlackBoxTest',
                payment_method: 'Efectivo',
                discount: 0,
                observations: 'Prueba automatizada - Borrar después',
                items: [
                    {
                        product_id: testProduct.id,
                        quantity: 1,
                        unit_price: 0,
                        original_price: Number(testProduct.sale_price) || 0
                    }
                ]
            };
            const res = await axios.post(`${API_URL}/sales`, payload);
            if (!res.data.id || !res.data.sale_number) {
                throw new Error('La venta no devolvió ID o número');
            }
            saleId = res.data.id;
            console.log(`   Venta creada: ${res.data.sale_number} (ID: ${saleId})`);
            return true;
        });

        // 6. Verificar que el stock se descontó correctamente
        await test('Verificar Stock (bajó 1)', async () => {
            const res = await axios.get(`${API_URL}/products`);
            const updatedProduct = res.data.find(p => p.id === testProduct.id);
            if (!updatedProduct) throw new Error('Producto no encontrado después de la venta');
            const currentStock = Number(updatedProduct.stock[branch] || 0);
            console.log(`   Stock actual en ${branch}: ${currentStock}`);
            if (currentStock !== initialStock - 1) {
                throw new Error(`Se esperaba stock ${initialStock - 1} pero se obtuvo ${currentStock}`);
            }
            return true;
        });

        // 7. Verificar que se registró el movimiento "Salida por Venta"
        await test('Verificar Movimiento (Salida por Venta)', async () => {
            const res = await axios.get(`${API_URL}/movements`);
            const movements = res.data;
            const found = movements.find(m => m.sale_id == saleId && m.type === 'Salida por Venta');
            if (!found) {
                throw new Error(`No se encontró movimiento para sale_id ${saleId}`);
            }
            console.log(`   Movimiento encontrado: ${found.type} - ${found.quantity} unidades`);
            return true;
        });

        // 8. Verificar que la venta aparezca en el historial
        await test('Verificar Historial de Ventas', async () => {
            const res = await axios.get(`${API_URL}/sales`);
            const sales = res.data;
            const found = sales.find(s => s.id == saleId);
            if (!found) {
                throw new Error(`No se encontró venta con ID ${saleId}`);
            }
            console.log(`   Venta encontrada: ${found.sale_number} - Total: ${found.total}`);
            return true;
        });

        // 9. (Opcional) Limpiar la venta de prueba para no ensuciar el historial
        console.log('\n🧹 Nota: La venta de prueba se ha registrado en la base de datos.');
        console.log('   Puedes eliminarla manualmente con los siguientes SQL si lo deseas:');
        console.log(`   DELETE FROM inventory_movements WHERE sale_id = ${saleId};`);
        console.log(`   DELETE FROM sale_items WHERE sale_id = ${saleId};`);
        console.log(`   DELETE FROM sales WHERE id = ${saleId};`);
    }

    // Resumen final
    console.log(`\n📊 RESULTADOS: ${passCount} exitosas, ${failCount} fallidas`);
    console.log('✅ Pruebas de caja negra completadas.');
}

runTests().catch(console.error);