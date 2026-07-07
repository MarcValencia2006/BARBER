# Barber

Sistema limpio para inventario y ventas multi-sucursal con diseño oscuro/dorado, backend Node.js + Express, despliegue en Render y base de datos Supabase PostgreSQL.

El sistema inicia sin productos, sin stock y sin ventas de prueba. Solo se crean las sucursales iniciales y roles base.

## Incluye

* Dashboard conectado a datos reales.
* Inventario por sucursal.
* Registro de productos con SKU único.
* Stock inicial por sucursal.
* Buscador por nombre, SKU, código de barras o QR.
* Módulo de ventas con carrito.
* Validación de stock disponible.
* Descuento automático de inventario al confirmar venta.
* Movimiento `Salida por Venta`.
* Historial de ventas.
* Historial de movimientos.
* Devoluciones preparadas en API y base de datos.
* Refresco automático cada 10 segundos para ver cambios desde PC o celular.

## Requisitos

* Node.js 18 o superior.
* Cuenta de Supabase.
* Cuenta de Render.
* Repositorio GitHub con este proyecto.

## Configuración local

1. Crea un proyecto en Supabase.
2. Abre Supabase > SQL Editor.
3. Ejecuta el contenido de `database/schema.sql`.
4. Copia la cadena de conexión PostgreSQL de Supabase.
5. Crea `.env` desde `.env.example` y coloca tu `DATABASE_URL`.
6. Instala dependencias:

```bash
npm install
```

7. Inicia el sistema:

```bash
npm start
```

8. Abre:

```text
http://localhost:3000
```

## Despliegue en Render

1. Sube esta carpeta a GitHub.
2. En Render, crea un nuevo `Web Service`.
3. Conecta el repositorio.
4. Usa:

```text
Build Command: npm install
Start Command: npm start
```

5. Agrega variables de entorno:

```text
NODE_ENV=production
DATABASE_URL=tu_connection_string_de_supabase
CORS_ORIGIN=https://tu-app.onrender.com
```

6. Despliega.
7. Abre la URL pública de Render desde tu celular.

## Estructura

```text
inventario-premium/
  index.html
  styles.css
  app.js
  package.json
  render.yaml
  .env.example
  database/
    schema.sql
  server/
    server.js
```

## Nota

Para producción completa todavía conviene agregar autenticación con usuarios reales, permisos por rol, generación PDF de comprobantes, backups y políticas de seguridad más estrictas.
