-- Plate Pilot Database Schema
-- Compatible with SQLite and MySQL / MariaDB

CREATE TABLE IF NOT EXISTS restaurants (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  cuisine VARCHAR(255),
  owner_name VARCHAR(255) NOT NULL,
  owner_phone VARCHAR(32) NOT NULL,
  owner_password VARCHAR(255) NOT NULL,
  order_prefix VARCHAR(32) NOT NULL,
  address TEXT,
  tables_count INT DEFAULT 6,
  plan VARCHAR(64) DEFAULT 'Annual Plan',
  status VARCHAR(32) DEFAULT 'active',
  gmv DECIMAL(12,2) DEFAULT 0,
  created_date VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  password VARCHAR(255) NOT NULL,
  pin VARCHAR(16) DEFAULT '1234',
  permissions TEXT,
  avatar VARCHAR(16),
  is_app_admin INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(64) NOT NULL,
  restaurant_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (restaurant_id, id)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id VARCHAR(64) NOT NULL,
  restaurant_id VARCHAR(64) NOT NULL,
  category_id VARCHAR(64),
  title VARCHAR(255) NOT NULL,
  subtitle TEXT,
  price DECIMAL(10,2) NOT NULL,
  cost DECIMAL(10,2) DEFAULT 0,
  stock INT DEFAULT 50,
  in_stock INT DEFAULT 1,
  image TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (restaurant_id, id)
);

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL,
  type VARCHAR(128) NOT NULL,
  table_number INT,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(32),
  payment_status VARCHAR(64) DEFAULT 'PAID (UPI)',
  payment_method VARCHAR(64) DEFAULT 'UPI',
  subtotal DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(32) DEFAULT 'active',
  source VARCHAR(32) DEFAULT 'pos',
  received_time VARCHAR(32),
  time_ago VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id VARCHAR(64) NOT NULL,
  restaurant_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  qty INT NOT NULL,
  item_total DECIMAL(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id VARCHAR(64) NOT NULL,
  restaurant_id VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  discount_type VARCHAR(16) NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  min_order DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  active INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (restaurant_id, id)
);

CREATE TABLE IF NOT EXISTS qr_settings (
  restaurant_id VARCHAR(64) PRIMARY KEY,
  enabled INT DEFAULT 1,
  table_count INT DEFAULT 6,
  upi_id VARCHAR(128),
  wifi_ssid VARCHAR(128),
  wifi_password VARCHAR(128)
);
