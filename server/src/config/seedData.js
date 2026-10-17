/**
 * Plate Pilot - Clean Production Seed Data
 * Synchronized with Super Admin (9911193569 / 5959) and 0 demo orders
 */

const PLATFORM_SUPER_ADMIN = {
  id: "admin-master",
  name: "Plate Pilot Super Admin",
  role: "Platform Super Admin",
  phone: "9911193569",
  password: "5959",
  pin: "5959",
  avatar: "SA",
  isAppAdmin: true,
  permissions: ["all", "admin"]
};

const DEFAULT_ONBOARDED_RESTAURANTS = [
  {
    id: "rest-1",
    name: "Roast & Cart Speciality",
    cuisine: "Specialty Coffee & Bakery",
    ownerName: "Plate Pilot Admin",
    ownerPhone: "9911193569",
    ownerPassword: "5959",
    orderPrefix: "RC-",
    address: "Shop 4, Connaught Place, New Delhi",
    tablesCount: 6,
    plan: "Annual Plan",
    status: "active",
    gmv: 0,
    createdDate: new Date().toISOString().split("T")[0]
  }
];

const DEFAULT_OUTLET_DATA = {
  "rest-1": {
    categories: [
      { id: "coffee", name: "Specialty Coffee" },
      { id: "bakery", name: "Artisan Bakery" },
      { id: "sandwiches", name: "Sourdough Toasties" },
      { id: "cold-bevs", name: "Cold Brews & Tonics" }
    ],
    menuItems: [
      { id: "item-1", title: "Flat White", subtitle: "Double ristretto with velvety micro-foam", price: 4.80, cost: 1.40, category: "coffee", stock: 45, inStock: true, image: "https://images.unsplash.com/photo-1577968897966-3d4325b36b61?w=500&auto=format&fit=crop&q=60" },
      { id: "item-2", title: "Almond Croissant", subtitle: "Twice-baked with frangipane & toasted flaked almonds", price: 5.50, cost: 1.65, category: "bakery", stock: 18, inStock: true, image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=60" },
      { id: "item-3", title: "Iced Spanish Latte", subtitle: "Espresso over condensed milk & fresh whole milk on rocks", price: 6.20, cost: 1.85, category: "coffee", stock: 30, inStock: true, image: "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500&auto=format&fit=crop&q=60" },
      { id: "item-4", title: "Pain au Chocolat", subtitle: "Laminated butter pastry with two batons of dark chocolate", price: 4.50, cost: 1.35, category: "bakery", stock: 12, inStock: true, image: "https://images.unsplash.com/photo-1530610476181-d83430b64dcd?w=500&auto=format&fit=crop&q=60" },
      { id: "item-5", title: "Truffle Mushroom Toastie", subtitle: "Sautéed wild mushrooms, gruyere cheese on sourdough", price: 8.50, cost: 2.80, category: "sandwiches", stock: 14, inStock: true, image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=500&auto=format&fit=crop&q=60" },
      { id: "item-6", title: "Cascara Tonic Fizz", subtitle: "Coffee cherry tea infused with premium craft tonic & lime", price: 5.80, cost: 1.50, category: "cold-bevs", stock: 22, inStock: true, image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60" }
    ],
    orders: [],
    staff: [
      { id: "st-1", name: "Plate Pilot Admin", role: "Store Owner / Admin", phone: "9911193569", password: "5959", pin: "5959", permissions: ["all"], avatar: "SA", isAppAdmin: true }
    ],
    offers: [
      { id: "off-1", code: "WELCOME20", title: "Flat 20% Off Welcome Treat", discountType: "pct", value: 20, minOrder: 150, description: "Get 20% off on your first dine-in QR order.", active: true },
      { id: "off-2", code: "FLAT50", title: "Flat ₹50 Super Saver", discountType: "flat", value: 50, minOrder: 250, description: "Save flat ₹50 on coffee combos above ₹250.", active: true }
    ],
    qrOrdering: { enabled: true, tableCount: 6, upiId: "platepilot@upi" }
  }
};

module.exports = {
  PLATFORM_SUPER_ADMIN,
  DEFAULT_ONBOARDED_RESTAURANTS,
  DEFAULT_OUTLET_DATA
};
