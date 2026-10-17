# 🍽️ Plate Pilot — Smart Restaurant POS, QR Platform & SaaS Suite

Plate Pilot is an all-inclusive, modern restaurant management platform designed for standalone cafes, QSR outlets, and franchise chains. It delivers counter billing, contactless table QR menu ordering, live kitchen order synchronization, staff permission access controls, and multi-outlet SaaS management.

---

## ✨ Features

- **⚡ Fast POS Terminal & Counter Billing**:
  - Item catalog with instant search, category filtering, and one-tap checkout.
  - Split tenders (Cash & Instant UPI QR) with thermal receipt preview.
  - Cash drawer float accounting & live session reconciliation.

- **📱 Dine-in Custom QR Ordering Portal (`qr-menu.html`)**:
  - Unique QR codes per dining table for customer self-ordering.
  - Direct live ticket push into the restaurant kitchen pipeline.
  - Real-time order progress tracking and instant promotional discount vouchers.

- **📊 Live Operational Dashboard & Analytics**:
  - Live metric KPI cards: Today's Sales, Completed Orders, Open Tabs, Average Ticket Value, and Best Seller.
  - Item-Wise top seller volume and revenue breakdown.
  - Time filter views: Today, This Week, and This Month.

- **☁️ Supabase Cloud & Real-Time Sync**:
  - Real-time PostgreSQL cloud database backend for multi-terminal sync.
  - Realtime subscriptions for instantaneous order notifications and live status updates.
  - Centralized Supabase credentials management within the Super Admin Panel.

- **🏢 Multi-Branch & SaaS Headquarters Console**:
  - Multi-outlet management with independent restaurant databases and menu catalogs.
  - Platform SaaS metrics, annual licensing revenue tracking (ARR/MRR), and outlet management.
  - Impersonation and isolated store contexts for secure multi-tenancy.

---

## 🚀 Quick Start

### 1. Launch the Frontend
You can open `index.html` directly in any modern browser:
```bash
# Open in your default browser
start index.html
```
Or serve it via any static HTTP server:
```bash
npx serve .
```

### 2. Live QR Menu Website
Open `qr-menu.html` or scan the generated table tent cards from the restaurant settings tab:
```bash
start qr-menu.html?rest=rest-1&table=1
```

### 3. (Optional) Run the Node.js Express Backend
If you want to use the local REST API server:
```bash
cd server
npm install
npm run seed     # Initializes the database and seeds starter data
npm start        # Starts server on http://localhost:5000
```

### 4. Connect Supabase Cloud Database
1. Create a project at [Supabase](https://supabase.com).
2. Run the SQL script from `supabase_schema.sql` in the Supabase SQL Editor.
3. In Plate Pilot, sign in to the **Super Admin Panel** (`Admin` tab) and navigate to **Cloud Database (Supabase)**.
4. Paste your **Project URL** and **Anon Public API Key**, then click **Save & Activate Live Sync**.

---

## 📁 Repository Structure

```text
├── index.html            # Main Restaurant Application (POS, Dashboard, Menu, Settings, Admin)
├── qr-menu.html          # Standalone Mobile QR Customer Menu & Ordering Portal
├── api.js                # Frontend REST API Client
├── supabase-client.js    # Supabase Realtime Cloud Sync Engine
├── supabase_schema.sql   # PostgreSQL Database Schema for Supabase
├── .gitignore            # Git ignore configuration
└── server/               # Node.js Express REST API backend
    ├── package.json
    └── src/
        ├── app.js
        ├── server.js
        ├── config/       # Database connection & SQL initialization
        ├── controllers/  # API controllers for orders, menu, admin, qr, staff
        ├── middleware/   # Authentication & error handling
        └── routes/       # Express route handlers
```

---

## 🔒 Security & Access Roles

| Role | Permissions |
| :--- | :--- |
| **Platform Super Admin** | Full platform control, multi-outlet management, SaaS sales analytics & Supabase configuration |
| **Store Owner** | Complete operational access to the restaurant's POS, Menu, Orders, Table QRs, and Staff |
| **Lead Cashier** | Fast POS ticket billing, checkout & order status tracking |
| **Kitchen Lead** | Live kitchen order queue management and menu availability toggling |
