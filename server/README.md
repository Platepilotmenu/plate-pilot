# Plate Pilot Backend API & Database

Production-ready backend server and database engine powering the Plate Pilot Multi-Outlet Restaurant POS, QR Self-Ordering, and Super Admin Central Platform.

---

## 🌟 Highlights & Capabilities

- **Zero-Config Database**: Embedded SQLite database (`data/platepilot.db`) pre-seeded with 4 restaurants, menus, staff, orders, offers, and SaaS metrics.
- **Enterprise Ready**: Seamlessly switch to MySQL / MariaDB by setting `DB_TYPE=mysql` in `.env`.
- **Role-Based Access Control (RBAC)**:
  - **Platform App Owner**: Exclusive master control over Super Admin Central, SaaS metrics, outlet onboarding, and temporary impersonation.
  - **Restaurant Owners**: Full operational control over their specific store (POS, Live Orders, Menu Catalog, Staff, Cart Settings).
  - **Staff Members**: Granular permissions (`pos`, `menu`) with fast PIN login for terminal shifts.
- **Public Customer QR Dining**:
  - Digital interactive menu by table number.
  - Customer self-order placement directly into POS and kitchen display stream.
  - Live order tracking (`active` → `ready` → `completed`).

---

## 🚀 Getting Started

### 1. Installation
The dependencies are already installed in `server/`:
```bash
cd server
npm install
```

### 2. Environment Configuration
Configuration is defined in `server/.env`:
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=platepilot_super_secret_jwt_key_2026_secure_hash_8921

# Database Engine: 'sqlite' or 'mysql'
DB_TYPE=sqlite
DB_SQLITE_PATH=./data/platepilot.db

# Master Super Admin Credentials
SUPER_ADMIN_PHONE=9999999999
SUPER_ADMIN_PASSWORD=admin123
SUPER_ADMIN_PIN=9999
```

### 3. Start the Server
```bash
# Start server
npm start

# Or with live reload
npm run dev

# Re-seed database to default factory state
npm run seed
```

Server will start on **`http://localhost:5000`** and the API endpoints will be live under **`/api`**.

---

## 📡 API Reference

### 🔐 1. Authentication (`/api/auth`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/auth/login` | Phone/password unified login | Public |
| `POST` | `/api/auth/pin` | Quick 4-digit PIN switch for POS cashiers | Public |
| `GET` | `/api/auth/me` | Fetch verified session and role info | Authenticated |

#### Example Login Request:
```json
POST /api/auth/login
{
  "phone": "9999999999",
  "password": "admin123"
}
```
*Returns JWT Bearer token and user payload.*

---

### 🛡️ 2. Super Admin Central (`/api/admin`)
*Strictly guarded: Accessible **ONLY** to the Plate Pilot App Owner (`Phone: 9999999999`)*

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/admin/metrics` | Platform ARR, MRR, GMV, total & active outlets | App Owner |
| `GET` | `/api/admin/restaurants` | List all onboarded restaurants with search/filters | App Owner |
| `POST` | `/api/admin/restaurants` | Onboard new restaurant with Annual Plan (₹1,999/yr) | App Owner |
| `PUT` | `/api/admin/restaurants/:id` | Update restaurant profile and owner credentials | App Owner |
| `PATCH` | `/api/admin/restaurants/:id/status` | Toggle restaurant status (`active` / `suspended`) | App Owner |
| `DELETE` | `/api/admin/restaurants/:id` | Offboard and delete restaurant | App Owner |
| `POST` | `/api/admin/impersonate/:id` | Create delegated session to manage store as owner | App Owner |

---

### 🏪 3. Restaurant Profile & QR Settings (`/api/restaurants`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/restaurants/:id` | Get full outlet profile, address, tables | Store Staff / Owner |
| `PUT` | `/api/restaurants/:id` | Update restaurant branding and settings | Store Owner |
| `GET` | `/api/restaurants/:id/qr-settings` | Get QR dining configuration & table count | Store Staff / Owner |
| `PUT` | `/api/restaurants/:id/qr-settings` | Update WiFi credentials, UPI ID, table count | Store Owner |

---

### 🍽️ 4. Menu Catalog & Categories (`/api/restaurants`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/restaurants/:id/categories` | List food & beverage categories | Store Staff |
| `POST` | `/api/restaurants/:id/categories` | Add custom category | Menu Lead / Owner |
| `DELETE` | `/api/restaurants/:id/categories/:categoryId` | Delete category | Menu Lead / Owner |
| `GET` | `/api/restaurants/:id/menu` | List all menu dishes with stock & prices | Store Staff |
| `POST` | `/api/restaurants/:id/menu` | Create new dish with image and cost | Menu Lead / Owner |
| `PUT` | `/api/restaurants/:id/menu/:itemId` | Edit dish recipe, price, category | Menu Lead / Owner |
| `PATCH` | `/api/restaurants/:id/menu/:itemId/stock` | Toggle in-stock or 86 item | Cashier / Menu / Owner |
| `DELETE` | `/api/restaurants/:id/menu/:itemId` | Remove item from menu | Menu Lead / Owner |

---

### 🧾 5. Orders & POS Operations (`/api/restaurants`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/restaurants/:id/orders` | Live order stream (filters: active, ready, completed) | POS Staff / Owner |
| `POST` | `/api/restaurants/:id/orders` | Place POS order, updates restaurant GMV | POS Staff / Owner |
| `GET` | `/api/restaurants/:id/orders/:orderId` | Itemized order bill and payment receipt | POS Staff / Owner |
| `PATCH` | `/api/restaurants/:id/orders/:orderId/status` | Transition status (`active` → `ready` → `completed` / `void`) | POS Staff / Owner |
| `GET` | `/api/restaurants/:id/dashboard-metrics` | Today's revenue, order counts, average ticket | Store Staff / Owner |

---

### 🏷️ 6. Offers & Discounts (`/api/restaurants`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/restaurants/:id/offers` | List promotional coupons | Store Staff |
| `POST` | `/api/restaurants/:id/offers` | Create coupon (`WELCOME20`, `FLAT50`) | Store Owner |
| `PUT` | `/api/restaurants/:id/offers/:offerId` | Edit coupon rules and discounts | Store Owner |
| `DELETE` | `/api/restaurants/:id/offers/:offerId` | Remove coupon | Store Owner |
| `POST` | `/api/restaurants/:id/offers/validate` | Validate coupon and compute discount for cart | Store Staff / QR |

---

### 👥 7. Staff Management (`/api/restaurants`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/restaurants/:id/staff` | List staff with roles, phones, PINs | Store Staff / Owner |
| `POST` | `/api/restaurants/:id/staff` | Add new staff member (Cashier, Barista, Chef) | Store Owner |
| `PUT` | `/api/restaurants/:id/staff/:staffId` | Edit role, permissions (`pos`, `menu`), PIN | Store Owner |
| `DELETE` | `/api/restaurants/:id/staff/:staffId` | Remove staff member | Store Owner |

---

### 📱 8. Public Customer QR Dining (`/api/qr`)
*Completely public - Scanned by restaurant guests at dine-in tables*

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/qr/:restId/table/:tableNum` | Customer menu, active offers, WiFi, UPI | Public |
| `POST` | `/api/qr/:restId/order` | Customer places table self-order from phone | Public |
| `GET` | `/api/qr/order/:orderId` | Live order preparation and readiness tracking | Public |

---

## 🗄️ Database Architecture

```
                    ┌────────────────────────┐
                    │      restaurants       │
                    │────────────────────────│
                    │ id (PK)                │
                    │ name, cuisine, address │
                    │ owner_name, owner_phone│
                    │ order_prefix           │
                    │ plan (Annual Plan)     │
                    │ status (active)        │
                    │ gmv                    │
                    └───────────┬────────────┘
                                │ 1:N
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
        ▼                       ▼                        ▼
┌──────────────┐        ┌──────────────┐         ┌──────────────┐
│  categories  │        │  menu_items  │         │    staff     │
├──────────────┤        ├──────────────┤         ├──────────────┤
│ id (PK)      │        │ id (PK)      │         │ id (PK)      │
│ restaurant_id│        │ restaurant_id│         │ restaurant_id│
│ name         │        │ category_id  │         │ name, phone  │
└──────────────┘        │ title, price │         │ role, pin    │
                        │ stock, image │         │ permissions  │
                        └──────────────┘         │ is_app_admin │
                                                 └──────────────┘
                                │ 1:N
        ┌───────────────────────┴────────────────────────┐
        │                                                │
        ▼                                                ▼
┌──────────────┐                                 ┌──────────────┐
│    orders    │◄───────────────────────────────┤    offers    │
├──────────────┤                                 ├──────────────┤
│ id (PK)      │                                 │ id (PK)      │
│ restaurant_id│                                 │ restaurant_id│
│ type, table  │                                 │ code, value  │
│ total, status│                                 │ discount_type│
│ source       │                                 └──────────────┘
└───────┬──────┘
        │ 1:N
        ▼
┌──────────────┐
│ order_items  │
├──────────────┤
│ id (PK)      │
│ order_id     │
│ name, price  │
│ qty, total   │
└──────────────┘
```

---

## 🔒 Security & Single-Account App Owner Rule

1. Only **Plate Pilot App Owner** (`Phone: 9999999999`, `Password: admin123`) has `isAppAdmin: true`.
2. All restaurant accounts (e.g., `Elena Rostova`, `Vikram Malhotra`, `Ananya Sen`, `Rohan Mehta`) are strictly restricted from accessing `/api/admin/*` endpoints. Any non-admin request yields `403 Forbidden`:
   ```json
   {
     "success": false,
     "error": "Access Denied: Admin Panel and platform management are restricted strictly to the single App Owner account."
   }
   ```
3. Super Admin impersonation generates an explicit audit token enabling temporary store viewing with clean session restoration.
