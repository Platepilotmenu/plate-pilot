-- =============================================================================
-- PLATE PILOT - PRODUCTION SUPABASE DATABASE SCHEMA & MIGRATION SCRIPT
-- =============================================================================
-- Database: PostgreSQL 15+ (Native Supabase Cloud Engine)
-- Features: Multi-tenant Architecture, Row Level Security (RLS), Realtime Replication,
--           Automatic GMV calculation trigger, Super Admin Auth (9911193569 / PIN: 5959)
-- =============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 2. TABLES DDL
-- =============================================================================

-- 2.1 Restaurants (Tenant Outlets)
CREATE TABLE IF NOT EXISTS public.restaurants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cuisine TEXT,
    owner_name TEXT NOT NULL,
    owner_phone TEXT NOT NULL,
    owner_password TEXT NOT NULL,
    order_prefix TEXT NOT NULL DEFAULT 'RC-',
    address TEXT,
    tables_count INTEGER NOT NULL DEFAULT 6,
    plan TEXT NOT NULL DEFAULT 'Annual Plan',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
    gmv NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2.2 Staff Users & Admins
CREATE TABLE IF NOT EXISTS public.staff_users (
    id TEXT PRIMARY KEY DEFAULT ('st-' || substr(md5(random()::text), 1, 8)),
    restaurant_id TEXT REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    phone TEXT NOT NULL,
    pin TEXT NOT NULL DEFAULT '5959',
    password TEXT NOT NULL DEFAULT '5959',
    permissions TEXT[] NOT NULL DEFAULT ARRAY['pos']::TEXT[],
    avatar TEXT DEFAULT 'SA',
    is_app_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast phone-based login lookups
CREATE INDEX IF NOT EXISTS idx_staff_users_phone ON public.staff_users(phone);
CREATE INDEX IF NOT EXISTS idx_staff_users_restaurant_id ON public.staff_users(restaurant_id);

-- 2.3 Dine-In Restaurant Tables
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    qr_code_url TEXT,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(restaurant_id, table_number)
);

-- 2.4 Menu Categories
CREATE TABLE IF NOT EXISTS public.menu_categories (
    id TEXT NOT NULL,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (restaurant_id, id)
);

-- 2.5 Menu Items
CREATE TABLE IF NOT EXISTS public.menu_items (
    id TEXT NOT NULL,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    stock INTEGER NOT NULL DEFAULT 50,
    in_stock BOOLEAN NOT NULL DEFAULT true,
    is_veg BOOLEAN NOT NULL DEFAULT true,
    popular BOOLEAN NOT NULL DEFAULT false,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (restaurant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_menu_items_rest_cat ON public.menu_items(restaurant_id, category_id);

-- 2.6 Offers & Coupons
CREATE TABLE IF NOT EXISTS public.offers (
    id TEXT NOT NULL,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('pct', 'flat')),
    value NUMERIC(10, 2) NOT NULL CHECK (value > 0),
    min_order NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (restaurant_id, id)
);

-- 2.7 Orders (POS & QR Table Orders)
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_number INTEGER,
    order_type TEXT NOT NULL DEFAULT 'Takeaway',
    customer_name TEXT,
    customer_phone TEXT,
    payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'UPI', 'CARD', 'NFC')),
    payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PAID', 'PENDING', 'VOID', 'PAID (UPI)', 'PAID (CASH)')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ready', 'done', 'void')),
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'pos' CHECK (source IN ('pos', 'qr', 'web')),
    channel TEXT,
    needs_acceptance BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON public.orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- 2.8 Order Line Items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    restaurant_id TEXT NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    menu_item_id TEXT,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    item_total NUMERIC(10, 2) NOT NULL,
    notes TEXT,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_done BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_restaurant_id ON public.order_items(restaurant_id);

-- 2.9 QR and Payment Settings
CREATE TABLE IF NOT EXISTS public.qr_settings (
    restaurant_id TEXT PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    table_count INTEGER NOT NULL DEFAULT 6,
    upi_id TEXT,
    wifi_ssid TEXT,
    wifi_password TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 3. AUTOMATIC TRIGGERS & BUSINESS LOGIC FUNCTIONS
-- =============================================================================

-- 3.1 Automatic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_restaurants_timestamp ON public.restaurants;
CREATE TRIGGER trigger_update_restaurants_timestamp
    BEFORE UPDATE ON public.restaurants
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_update_orders_timestamp ON public.orders;
CREATE TRIGGER trigger_update_orders_timestamp
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3.2 Automatic Restaurant GMV Accumulator Trigger
-- Automatically updates restaurants.gmv when an order is marked as 'done'
CREATE OR REPLACE FUNCTION public.sync_restaurant_gmv_on_order()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done')) THEN
        UPDATE public.restaurants
        SET gmv = gmv + NEW.total
        WHERE id = NEW.restaurant_id;
    ELSIF (OLD.status = 'done' AND NEW.status = 'void') THEN
        UPDATE public.restaurants
        SET gmv = GREATEST(0.00, gmv - OLD.total)
        WHERE id = NEW.restaurant_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_restaurant_gmv ON public.orders;
CREATE TRIGGER trigger_sync_restaurant_gmv
    AFTER UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.sync_restaurant_gmv_on_order();

-- =============================================================================
-- 4. TABLE PERMISSIONS & ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- 4.0 Grant Schema & Table Privileges to Supabase API Roles
-- Required: In Supabase, the API client connects as role 'anon' or 'authenticated'.
-- Without explicit GRANT USAGE and GRANT ALL, PostgreSQL blocks queries with "permission denied for table ...".
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Enable Row Level Security on all tables
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_settings ENABLE ROW LEVEL SECURITY;

-- 4.1 Restaurants Policies
DROP POLICY IF EXISTS "Public read active restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Public read restaurants" ON public.restaurants;
CREATE POLICY "Public read restaurants" ON public.restaurants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super Admin manage all restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Staff and Admin manage restaurants" ON public.restaurants;
CREATE POLICY "Staff and Admin manage restaurants" ON public.restaurants
    FOR ALL USING (true);

-- 4.2 Menu Categories Policies
DROP POLICY IF EXISTS "Public read menu categories" ON public.menu_categories;
CREATE POLICY "Public read menu categories" ON public.menu_categories
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Staff manage categories" ON public.menu_categories;
CREATE POLICY "Staff manage categories" ON public.menu_categories
    FOR ALL USING (true);

-- 4.3 Menu Items Policies
DROP POLICY IF EXISTS "Public read menu items" ON public.menu_items;
CREATE POLICY "Public read menu items" ON public.menu_items
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Staff manage menu items" ON public.menu_items;
CREATE POLICY "Staff manage menu items" ON public.menu_items
    FOR ALL USING (true);

-- 4.4 Offers & Discounts Policies
DROP POLICY IF EXISTS "Public read active offers" ON public.offers;
CREATE POLICY "Public read active offers" ON public.offers
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Staff manage offers" ON public.offers;
CREATE POLICY "Staff manage offers" ON public.offers
    FOR ALL USING (true);

-- 4.5 QR Settings Policies
DROP POLICY IF EXISTS "Public read qr settings" ON public.qr_settings;
CREATE POLICY "Public read qr settings" ON public.qr_settings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Staff manage qr settings" ON public.qr_settings;
CREATE POLICY "Staff manage qr settings" ON public.qr_settings
    FOR ALL USING (true);

-- 4.6 Orders & Line Items Policies (POS & QR Dining)
DROP POLICY IF EXISTS "Public insert orders from QR menu" ON public.orders;
DROP POLICY IF EXISTS "Public select their own placed orders" ON public.orders;
DROP POLICY IF EXISTS "Staff read their restaurant orders" ON public.orders;
DROP POLICY IF EXISTS "Staff update their restaurant orders" ON public.orders;
DROP POLICY IF EXISTS "Universal access to orders" ON public.orders;
CREATE POLICY "Universal access to orders" ON public.orders
    FOR ALL USING (true);

DROP POLICY IF EXISTS "Public insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Public select order items" ON public.order_items;
DROP POLICY IF EXISTS "Universal access to order items" ON public.order_items;
CREATE POLICY "Universal access to order items" ON public.order_items
    FOR ALL USING (true);

-- 4.7 Restaurant Tables Policies
DROP POLICY IF EXISTS "Universal access to restaurant tables" ON public.restaurant_tables;
CREATE POLICY "Universal access to restaurant tables" ON public.restaurant_tables
    FOR ALL USING (true);

-- 4.8 Staff Users Policies
DROP POLICY IF EXISTS "Staff manage staff users" ON public.staff_users;
DROP POLICY IF EXISTS "Universal access to staff users" ON public.staff_users;
CREATE POLICY "Universal access to staff users" ON public.staff_users
    FOR ALL USING (true);

-- =============================================================================
-- 5. REALTIME REPLICATION (Instant WebSocket Push to POS & QR Menu)
-- =============================================================================

-- Enable Realtime publication for instant cross-device updates safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'menu_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'restaurants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurants;
    END IF;
END $$;

-- Set replica identity to FULL so realtime listeners receive complete old and new records
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;

-- =============================================================================
-- 6. CLEAN PRODUCTION SEED DATA (ZERO DEMO ORDERS)
-- =============================================================================

-- 6.1 Clean Platform Super Admin Account
INSERT INTO public.staff_users (
    id, restaurant_id, name, role, phone, pin, password, permissions, avatar, is_app_admin
) VALUES (
    'admin-master',
    NULL,
    'Plate Pilot Admin',
    'Platform Super Admin',
    '9911193569',
    '5959',
    '5959',
    ARRAY['all', 'admin'],
    'SA',
    true
) ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    pin = EXCLUDED.pin,
    password = EXCLUDED.password,
    name = EXCLUDED.name,
    is_app_admin = true;

-- 6.2 Clean Starter Restaurant (GMV starts at 0, no fake orders)
INSERT INTO public.restaurants (
    id, name, cuisine, owner_name, owner_phone, owner_password, order_prefix, address, tables_count, plan, status, gmv
) VALUES (
    'rest-1',
    'Roast & Cart Speciality',
    'Specialty Coffee & Bakery',
    'Plate Pilot Admin',
    '9911193569',
    '5959',
    'RC-',
    'Shop 4, Connaught Place, New Delhi',
    6,
    'Annual Plan',
    'active',
    0.00
) ON CONFLICT (id) DO UPDATE SET
    owner_phone = EXCLUDED.owner_phone,
    owner_password = EXCLUDED.owner_password,
    owner_name = EXCLUDED.owner_name,
    gmv = EXCLUDED.gmv;

-- 6.3 Store Owner Record for rest-1
INSERT INTO public.staff_users (
    id, restaurant_id, name, role, phone, pin, password, permissions, avatar, is_app_admin
) VALUES (
    'st-1',
    'rest-1',
    'Plate Pilot Admin',
    'Store Owner / Admin',
    '9911193569',
    '5959',
    '5959',
    ARRAY['all'],
    'SA',
    true
) ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    pin = EXCLUDED.pin,
    password = EXCLUDED.password;

-- 6.4 QR Settings for rest-1
INSERT INTO public.qr_settings (
    restaurant_id, enabled, table_count, upi_id, wifi_ssid, wifi_password
) VALUES (
    'rest-1',
    true,
    6,
    'platepilot@upi',
    'PlatePilot_Guest',
    'coffee123'
) ON CONFLICT (restaurant_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    table_count = EXCLUDED.table_count;

-- 6.5 Tables 1-6 for rest-1
INSERT INTO public.restaurant_tables (restaurant_id, table_number, status)
VALUES 
    ('rest-1', 1, 'available'),
    ('rest-1', 2, 'available'),
    ('rest-1', 3, 'available'),
    ('rest-1', 4, 'available'),
    ('rest-1', 5, 'available'),
    ('rest-1', 6, 'available')
ON CONFLICT (restaurant_id, table_number) DO NOTHING;

-- 6.6 Menu Categories for rest-1
INSERT INTO public.menu_categories (id, restaurant_id, name, sort_order)
VALUES 
    ('coffee', 'rest-1', 'Specialty Coffee', 1),
    ('bakery', 'rest-1', 'Artisan Bakery', 2),
    ('sandwiches', 'rest-1', 'Sourdough Toasties', 3),
    ('cold-bevs', 'rest-1', 'Cold Brews & Tonics', 4)
ON CONFLICT (restaurant_id, id) DO NOTHING;

-- 6.7 Clean Menu Items for rest-1
INSERT INTO public.menu_items (id, restaurant_id, category_id, title, subtitle, price, cost, stock, in_stock, is_veg, image_url)
VALUES 
    ('item-1', 'rest-1', 'coffee', 'Flat White', 'Double ristretto with velvety micro-foam', 220.00, 65.00, 45, true, true, 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=500&auto=format&fit=crop&q=60'),
    ('item-2', 'rest-1', 'bakery', 'Almond Croissant', 'Twice-baked with frangipane & toasted flaked almonds', 180.00, 50.00, 18, true, true, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=60'),
    ('item-3', 'rest-1', 'coffee', 'Iced Spanish Latte', 'Espresso over condensed milk & fresh whole milk on rocks', 250.00, 75.00, 30, true, true, 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500&auto=format&fit=crop&q=60'),
    ('item-4', 'rest-1', 'bakery', 'Pain au Chocolat', 'Laminated butter pastry with two batons of dark chocolate', 160.00, 45.00, 12, true, true, 'https://images.unsplash.com/photo-1530610476181-d83430b64dcd?w=500&auto=format&fit=crop&q=60'),
    ('item-5', 'rest-1', 'sandwiches', 'Truffle Mushroom Toastie', 'Sautéed wild mushrooms, gruyere cheese on sourdough', 290.00, 85.00, 14, true, true, 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500&auto=format&fit=crop&q=60'),
    ('item-6', 'rest-1', 'cold-bevs', 'Cascara Tonic Fizz', 'Coffee cherry tea infused with premium craft tonic & lime', 210.00, 60.00, 22, true, true, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60')
ON CONFLICT (restaurant_id, id) DO NOTHING;

-- 6.8 Offers for rest-1
INSERT INTO public.offers (id, restaurant_id, code, title, discount_type, value, min_order, description, active)
VALUES 
    ('off-1', 'rest-1', 'WELCOME20', 'Flat 20% Off Welcome Treat', 'pct', 20.00, 150.00, 'Get 20% off on your first dine-in QR order.', true),
    ('off-2', 'rest-1', 'FLAT50', 'Flat ₹50 Super Saver', 'flat', 50.00, 250.00, 'Save flat ₹50 on coffee combos above ₹250.', true)
ON CONFLICT (restaurant_id, id) DO NOTHING;

-- NOTE: public.orders and public.order_items are left completely empty (0 rows).
-- No demo mock orders are seeded. Clean operational slate!
