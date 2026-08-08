const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
const BASE_URL = 'http://localhost:3000';

let passed = 0;
let failed = 0;

async function testEndpoint(method, url, data = null, description = '') {
    try {
        const config = {
            method,
            url: url.startsWith('http') ? url : `${API_URL}${url}`,
            headers: { 'Content-Type': 'application/json' },
            data,
        };
        const response = await axios(config);
        console.log(`✅ ${description || url} - OK (${response.status})`);
        passed++;
        return response.data;
    } catch (error) {
        console.log(`❌ ${description || url} - ERROR: ${error.message}`);
        if (error.response) {
            console.log(`   Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        failed++;
        return null;
    }
}

async function testHTML(url, description = '') {
    try {
        const response = await axios.get(`${BASE_URL}${url}`, { responseType: 'text' });
        console.log(`✅ ${description || url} - OK (${response.status})`);
        passed++;
        return response.data;
    } catch (error) {
        console.log(`❌ ${description || url} - ERROR: ${error.message}`);
        failed++;
        return null;
    }
}

async function runTests() {
    console.log('\n🚀 INICIANDO PRUEBAS DEL SISTEMA BARBER\n');

    // 1. Health check
    await testEndpoint('get', '/health', null, 'Health check');
    console.log('');

    // 2. Obtener productos
    const products = await testEndpoint('get', '/products', null, 'Lista de productos');
    if (products && products.length > 0) {
        console.log(`   📦 Total productos: ${products.length}`);
        const bandido = products.find(p => p.sku === 'BANDIDO-AZUL');
        if (bandido) {
            console.log(`   🎯 Bandido (Azul) encontrado. Stock TIENDA: ${bandido.stock?.TIENDA || 0}`);
        } else {
            console.log('   ⚠️ Bandido (Azul) NO encontrado');
        }
    }
    console.log('');

    // 3. Buscar productos (search)
    await testEndpoint('get', '/products/search?q=Bandido&limit=5', null, 'Búsqueda de "Bandido"');
    console.log('');

    // 4. Obtener ventas
    const sales = await testEndpoint('get', '/sales', null, 'Historial de ventas');
    if (sales && sales.length > 0) {
        console.log(`   📋 Total ventas: ${sales.length}`);
        console.log(`   🆔 Última venta: ${sales[0].sale_number} - Total: ${sales[0].total}`);
    }
    console.log('');

    // 5. Obtener movimientos
    const movements = await testEndpoint('get', '/movements', null, 'Historial de movimientos');
    if (movements && movements.length > 0) {
        console.log(`   📊 Total movimientos: ${movements.length}`);
        const last = movements[0];
        console.log(`   🕒 Último: ${last.type} - ${last.product_name} (${last.quantity}) en ${last.branch_code}`);
    }
    console.log('');

    // 6. Probar catálogo (HTML)
    await testHTML('/catalog', 'Catálogo público');
    console.log('');

    console.log(`✅ PRUEBAS COMPLETADAS: ${passed} exitosas, ${failed} fallidas`);
    console.log('');
}

runTests().catch(console.error);