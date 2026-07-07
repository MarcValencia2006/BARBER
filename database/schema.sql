CREATE TABLE IF NOT EXISTS branches (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('Barbería', 'Tienda')),
  status VARCHAR(20) NOT NULL DEFAULT 'Activa' CHECK (status IN ('Activa', 'Inactiva')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES roles(id),
  branch_id BIGINT NULL REFERENCES branches(id),
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo', 'Inactivo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  sku VARCHAR(80) NOT NULL UNIQUE,
  barcode VARCHAR(120) NULL UNIQUE,
  qr_code VARCHAR(120) NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  category VARCHAR(100) NULL,
  brand VARCHAR(100) NULL,
  provider VARCHAR(140) NULL,
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 0,
  max_stock INT NULL,
  unit VARCHAR(40) NOT NULL DEFAULT 'Unidad',
  image_url VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo', 'Inactivo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, branch_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY,
  sale_number VARCHAR(40) NOT NULL UNIQUE,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  seller_name VARCHAR(160) NOT NULL,
  customer_name VARCHAR(160) NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('Efectivo', 'QR', 'Tarjeta', 'Transferencia', 'Otro')),
  status VARCHAR(30) NOT NULL DEFAULT 'Completada' CHECK (status IN ('Completada', 'Cancelada', 'Devuelta')),
  observations TEXT NULL,
  estimated_profit NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sale_items (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  original_price NUMERIC(12,2) NOT NULL,
  applied_price NUMERIC(12,2) NOT NULL,
  final_price NUMERIC(12,2) NOT NULL,
  price_change_reason VARCHAR(255) NULL,
  authorized_by VARCHAR(160) NULL
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  sale_id BIGINT NULL REFERENCES sales(id),
  type VARCHAR(40) NOT NULL CHECK (type IN ('Entrada Inicial', 'Entrada Manual', 'Salida por Venta', 'Entrada por Devolución', 'Transferencia', 'Ajuste', 'Pérdida', 'Producto Dañado')),
  quantity INT NOT NULL,
  user_name VARCHAR(160) NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS returns (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  branch_id BIGINT NOT NULL REFERENCES branches(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  reason VARCHAR(255) NOT NULL,
  approved_by VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Aprobada', 'Rechazada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_name VARCHAR(160) NULL,
  action VARCHAR(120) NOT NULL,
  entity VARCHAR(120) NOT NULL,
  entity_id BIGINT NULL,
  detail JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_search ON products (name, sku, barcode, qr_code);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_movements_date ON inventory_movements (created_at DESC);

INSERT INTO branches (code, name, type)
VALUES
  ('PUCARANI', 'PUCARANI', 'Barbería'),
  ('UPEA', 'UPEA', 'Barbería'),
  ('BALLIVIAN', 'BALLIVIAN', 'Barbería'),
  ('TIENDA', 'TIENDA', 'Tienda')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (name)
VALUES ('Administrador'), ('Encargado'), ('Empleado')
ON CONFLICT (name) DO NOTHING;
