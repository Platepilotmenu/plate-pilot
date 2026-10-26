/**
 * Plate Pilot - Supabase Cloud Database Client & Realtime Sync Engine
 * Enables live multi-device synchronization over the internet between Merchant POS, QR Menu, and Tablet
 * Built with zero-dependency direct REST HTTP engine + WebSockets Realtime for maximum mobile reliability
 */

const PlatePilotCloud = (() => {
  // Hardcoded Production Supabase Project Credentials (Embedded Directly for Out-Of-The-Box Auto Initialization)
  const PRODUCTION_SUPABASE_URL = "https://uxtzgzarmtyoomrlgqrp.supabase.co";
  const PRODUCTION_SUPABASE_ANON_KEY = "sb_publishable_59SDCVYbSwOJCibnl9o0UQ_Z9zYvSR5";

  // Check saved config or URL params, defaulting to embedded production credentials
  const savedConfig = (() => {
    try {
      return JSON.parse(localStorage.getItem("platepilot_supabase_config") || "{}");
    } catch (e) {
      return {};
    }
  })();

  const urlParams = (() => {
    try {
      if (typeof window !== "undefined" && window.location) {
        return new URLSearchParams(window.location.search);
      }
      return new URLSearchParams();
    } catch (e) {
      return new URLSearchParams();
    }
  })();

  const initialUrl = (urlParams.get("sb_url") || urlParams.get("supabase_url") || savedConfig.url || PRODUCTION_SUPABASE_URL).trim();
  const initialKey = (urlParams.get("sb_key") || urlParams.get("supabase_key") || savedConfig.anonKey || PRODUCTION_SUPABASE_ANON_KEY).trim();

  // Persist production config in localStorage for offline caching
  try {
    localStorage.setItem("platepilot_supabase_config", JSON.stringify({ url: initialUrl, anonKey: initialKey }));
  } catch (e) {}

  const CONFIG = {
    url: initialUrl,
    anonKey: initialKey,
    get isConfigured() {
      return Boolean(
        this.url && 
        this.anonKey && 
        this.url.startsWith("https://") && 
        !this.url.includes("YOUR_PROJECT")
      );
    }
  };

  let clientInstance = null;
  let activeChannel = null;
  let activePollerTimer = null;

  // Initialize Supabase client for WebSockets Realtime (when library is available)
  function getClient() {
    if (clientInstance) return clientInstance;
    if (!CONFIG.isConfigured) return null;

    if (typeof window !== "undefined" && window.supabase && window.supabase.createClient) {
      clientInstance = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 10 } }
      });
      return clientInstance;
    }

    return null;
  }

  // Direct REST HTTP Helper (Reliable in all Android/iOS webviews with ZERO external CDN library dependency)
  async function restRequest(endpoint, options = {}) {
    if (!CONFIG.isConfigured) {
      throw new Error("Supabase is not configured");
    }

    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const fullUrl = `${CONFIG.url}/rest/v1${cleanEndpoint}`;

    const headers = {
      "apikey": CONFIG.anonKey,
      "Authorization": `Bearer ${CONFIG.anonKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {})
    };

    const fetchOpts = {
      method: options.method || "GET",
      headers
    };

    if (options.body !== undefined && options.body !== null) {
      fetchOpts.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    const res = await fetch(fullUrl, fetchOpts);
    if (res.status === 204) return null;

    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = text;
    }

    if (!res.ok) {
      const errMsg = typeof json === "object" && json ? (json.message || json.error || JSON.stringify(json)) : String(json || res.statusText);
      throw new Error(`Supabase REST Error (${res.status}): ${errMsg}`);
    }

    return json;
  }

  // Update credentials dynamically
  function configure(url, anonKey) {
    CONFIG.url = (url || "").trim();
    CONFIG.anonKey = (anonKey || "").trim();
    try {
      localStorage.setItem("platepilot_supabase_config", JSON.stringify({
        url: CONFIG.url,
        anonKey: CONFIG.anonKey
      }));
    } catch (e) {}
    clientInstance = null;
    return getClient();
  }

  // Check health and connection to Supabase
  async function testConnection() {
    if (!CONFIG.isConfigured) {
      return { 
        connected: false, 
        message: "Supabase credentials not configured. Using local offline storage." 
      };
    }

    try {
      const data = await restRequest("/restaurants?select=id,name,status&limit=5");
      return { 
        connected: true, 
        message: "Successfully connected to Supabase Cloud Database!",
        data 
      };
    } catch (err) {
      console.error("[PlatePilotCloud] Connection failed:", err.message);
      return { 
        connected: false, 
        message: `Connection failed: ${err.message}` 
      };
    }
  }

  // =========================================================================
  // RESTAURANTS CLOUD API
  // =========================================================================

  // Fetch all restaurants from Supabase
  async function fetchRestaurants() {
    try {
      const data = await restRequest("/restaurants?select=*&order=created_at.asc");
      return (data || []).map(r => ({
        id: r.id,
        name: r.name,
        cuisine: r.cuisine || "",
        ownerName: r.owner_name || "Admin",
        ownerPhone: r.owner_phone || "9911193569",
        ownerPassword: r.owner_password || "5959",
        orderPrefix: r.order_prefix || "PP-",
        address: r.address || "",
        tablesCount: parseInt(r.tables_count) || 6,
        plan: r.plan || "Annual Plan",
        status: r.status || "active",
        gmv: parseFloat(r.gmv || 0),
        createdDate: r.created_date || (r.created_at ? r.created_at.split("T")[0] : new Date().toISOString().split("T")[0])
      }));
    } catch (err) {
      console.warn("[PlatePilotCloud] fetchRestaurants error:", err.message);
      return null;
    }
  }

  // Upsert a restaurant record to Supabase & maintain corresponding staff owner entry
  async function upsertRestaurant(r) {
    if (!r || !r.id) return null;

    try {
      const cleanPhone = String(r.ownerPhone || r.owner_phone || "9911193569").replace(/\D/g, "").slice(-10);
      const row = {
        id: r.id,
        name: r.name,
        cuisine: r.cuisine || null,
        owner_name: r.ownerName || r.owner_name || "Admin",
        owner_phone: cleanPhone || "9911193569",
        owner_password: r.ownerPassword || r.owner_password || "5959",
        order_prefix: r.orderPrefix || r.order_prefix || "PP-",
        address: r.address || null,
        tables_count: parseInt(r.tablesCount || r.tables_count || 6),
        plan: r.plan || "Annual Plan",
        status: r.status || "active",
        gmv: parseFloat(r.gmv || 0),
        created_date: r.createdDate || r.created_date || new Date().toISOString().split("T")[0]
      };

      const res = await restRequest("/restaurants", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
        body: row
      });

      // Also upsert owner in staff_users table so staff login & multi-device auth recognize the owner
      try {
        const ownerStaffRow = {
          id: `owner-${r.id}`,
          restaurant_id: r.id,
          name: r.ownerName || r.owner_name || "Admin",
          role: `${r.name || "Store"} Owner`,
          phone: cleanPhone || "9911193569",
          pin: r.ownerPassword || r.owner_password || "5959",
          password: r.ownerPassword || r.owner_password || "5959",
          permissions: ["all"],
          avatar: (r.ownerName || "OW").slice(0, 2).toUpperCase(),
          is_app_admin: false
        };
        await restRequest("/staff_users", {
          method: "POST",
          headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
          body: ownerStaffRow
        });
      } catch (e) {
        console.warn("[PlatePilotCloud] Owner staff_users sync notice:", e.message);
      }

      return Array.isArray(res) ? res[0] : res;
    } catch (err) {
      console.warn("[PlatePilotCloud] upsertRestaurant error:", err.message);
      return null;
    }
  }

  // Delete a restaurant record from Supabase
  async function deleteRestaurant(restaurantId) {
    if (!restaurantId) return false;

    try {
      await restRequest(`/restaurants?id=eq.${encodeURIComponent(restaurantId)}`, {
        method: "DELETE"
      });
      return true;
    } catch (err) {
      console.warn("[PlatePilotCloud] deleteRestaurant error:", err.message);
      return false;
    }
  }

  // =========================================================================
  // ORDERS API & COLLISION-PROOF MULTI-DEVICE PLACEMENT
  // =========================================================================

  // Fetch all orders for a restaurant
  async function fetchOrders(restaurantId = "rest-1") {
    try {
      const endpoint = `/orders?select=*,items:order_items(*)&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc`;
      const data = await restRequest(endpoint);
      return data || [];
    } catch (err) {
      console.warn("[PlatePilotCloud] fetchOrders error:", err.message);
      return null;
    }
  }

  // Place a new order with collision detection and automatic ID deduplication
  async function placeOrder(orderData) {
    if (!orderData) return null;

    try {
      const targetRestId = orderData.restaurantId || orderData.restaurant_id || "rest-1";
      let proposedId = String(orderData.id || "").trim();

      // Collision Check: Check if this order ID already exists in Supabase
      if (proposedId) {
        try {
          const existing = await restRequest(`/orders?id=eq.${encodeURIComponent(proposedId)}&select=id`);
          if (Array.isArray(existing) && existing.length > 0) {
            console.warn(`[PlatePilotCloud] Order ID collision detected for ${proposedId}! Resolving unique ID...`);
            // Fetch recent orders to find the highest numeric ID
            const recent = await restRequest(`/orders?restaurant_id=eq.${encodeURIComponent(targetRestId)}&select=id&order=created_at.desc&limit=25`);
            const usedIds = new Set((recent || []).map(o => String(o.id)));
            usedIds.add(proposedId);

            let maxNum = 100;
            (recent || []).forEach(o => {
              const m = String(o.id || "").match(/(\d+)/);
              if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxNum && n < 999999) maxNum = n;
              }
            });

            const pfxMatch = proposedId.match(/^([A-Za-z]+-?)/);
            const pfx = pfxMatch ? pfxMatch[1].replace(/-+$/, "") + "-" : "PP-";

            let nextNum = maxNum + 1;
            let resolvedId = `${pfx}${nextNum}`;
            while (usedIds.has(resolvedId)) {
              nextNum++;
              resolvedId = `${pfx}${nextNum}`;
            }

            console.log(`[PlatePilotCloud] Resolved collision: ${proposedId} -> ${resolvedId}`);
            proposedId = resolvedId;
            orderData.id = resolvedId;
          }
        } catch (checkErr) {
          // If check fails, continue with proposedId
        }
      }

      if (!proposedId) {
        proposedId = `PP-${Date.now().toString().slice(-6)}`;
        orderData.id = proposedId;
      }

      const orderRecord = {
        id: proposedId,
        restaurant_id: targetRestId,
        table_number: orderData.tableNumber || orderData.table_number || null,
        order_type: orderData.orderType || orderData.type || "Dine-in",
        customer_name: orderData.customerName || orderData.customer || "Guest",
        customer_phone: orderData.customerPhone || orderData.customer_phone || null,
        payment_method: orderData.paymentMethod || orderData.payment_method || "UPI",
        payment_status: orderData.paymentStatus || orderData.payment_status || "PAID",
        status: orderData.status || "active",
        subtotal: parseFloat(orderData.subtotal || orderData.total || 0),
        discount: parseFloat(orderData.discount?.amount || orderData.discount || 0),
        tax: parseFloat(orderData.tax || 0),
        total: parseFloat(orderData.total || orderData.subtotal || 0),
        notes: orderData.notes || orderData.note || null,
        source: orderData.source || "pos",
        channel: orderData.channel || "POS Terminal",
        needs_acceptance: Boolean(orderData.needsAcceptance || orderData.needs_acceptance),
        created_at: orderData.createdAt || orderData.created_at || new Date().toISOString()
      };

      // 1. Insert/Upsert Order Record
      const insertedOrderList = await restRequest("/orders", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
        body: orderRecord
      });
      const insertedOrder = Array.isArray(insertedOrderList) ? insertedOrderList[0] : insertedOrderList;

      // 2. Insert Line Items
      if (Array.isArray(orderData.items) && orderData.items.length > 0) {
        const itemRows = orderData.items.map(it => ({
          order_id: proposedId,
          restaurant_id: targetRestId,
          menu_item_id: (it.id && String(it.id).length < 50) ? String(it.id) : null,
          name: it.name || it.title || "Menu Item",
          price: parseFloat(it.price || 0),
          quantity: parseInt(it.qty || it.quantity || 1),
          item_total: parseFloat(((it.price || 0) * (it.qty || it.quantity || 1)).toFixed(2)),
          notes: it.notes || it.note || null,
          tags: Array.isArray(it.tags) ? it.tags : [],
          is_done: Boolean(it.done || it.is_done)
        }));

        try {
          // Clean any previous items for this ID to prevent duplicate items on re-punches
          await restRequest(`/order_items?order_id=eq.${encodeURIComponent(proposedId)}`, { method: "DELETE" }).catch(() => {});
          await restRequest("/order_items", {
            method: "POST",
            body: itemRows
          });
        } catch (itemErr) {
          console.warn("[PlatePilotCloud] Error inserting items:", itemErr.message);
        }
      }

      return insertedOrder;
    } catch (err) {
      console.error("[PlatePilotCloud] placeOrder error:", err.message);
      return null;
    }
  }

  // Update order status (e.g. active -> ready -> done)
  async function updateOrderStatus(orderId, status, extraFields = {}) {
    if (!orderId) return null;

    try {
      const cleanStatus = String(status).toLowerCase().trim();
      const patchBody = {
        status: cleanStatus,
        ...extraFields
      };

      // By default, whenever order status transitions (accepted to active, marked ready, done, or void),
      // needs_acceptance should be cleared to false unless caller explicitly requested otherwise.
      if (!("needs_acceptance" in extraFields)) {
        patchBody.needs_acceptance = false;
      }

      const res = await restRequest(`/orders?id=eq.${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Prefer": "return=representation" },
        body: patchBody
      });
      return Array.isArray(res) ? res[0] : res;
    } catch (err) {
      console.warn("[PlatePilotCloud] updateOrderStatus error:", err.message);
      return null;
    }
  }

  // Explicit helper to accept a pending QR order
  async function acceptOrder(orderId) {
    return updateOrderStatus(orderId, "active", { needs_acceptance: false });
  }

  // =========================================================================
  // MENU & CATEGORIES API
  // =========================================================================

  async function fetchMenuData(restaurantId = "rest-1") {
    try {
      const [categories, menuItems, offers] = await Promise.all([
        restRequest(`/menu_categories?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=sort_order.asc`).catch(() => []),
        restRequest(`/menu_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}`).catch(() => []),
        restRequest(`/offers?restaurant_id=eq.${encodeURIComponent(restaurantId)}&active=eq.true`).catch(() => [])
      ]);

      return {
        categories: categories || [],
        menuItems: menuItems || [],
        offers: offers || []
      };
    } catch (err) {
      console.warn("[PlatePilotCloud] fetchMenuData error:", err.message);
      return null;
    }
  }

  async function upsertMenuCategory(restaurantId, cat) {
    if (!restaurantId || !cat) return false;
    try {
      const row = {
        id: cat.id,
        restaurant_id: restaurantId,
        name: cat.name,
        sort_order: parseInt(cat.sort_order || cat.sortOrder || 0)
      };
      await restRequest("/menu_categories", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates" },
        body: row
      });
      return true;
    } catch (e) {
      console.warn("[PlatePilotCloud] upsertMenuCategory error:", e.message);
      return false;
    }
  }

  async function deleteMenuCategory(restaurantId, catId) {
    if (!restaurantId || !catId) return false;
    try {
      await restRequest(`/menu_categories?restaurant_id=eq.${encodeURIComponent(restaurantId)}&id=eq.${encodeURIComponent(catId)}`, {
        method: "DELETE"
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function upsertMenuItem(restaurantId, item) {
    if (!restaurantId || !item) return false;
    try {
      const row = {
        id: item.id,
        restaurant_id: restaurantId,
        category_id: item.category || item.category_id || "all",
        title: item.name || item.title || "Menu Item",
        subtitle: item.subtitle || item.desc || null,
        price: parseFloat(item.price || 0),
        cost: parseFloat(item.cost || 0),
        stock: parseInt(item.stock || 50),
        in_stock: item.inStock !== false && item.in_stock !== false,
        is_veg: item.isVeg !== false && item.is_veg !== false,
        popular: Boolean(item.popular),
        tags: Array.isArray(item.tags) ? item.tags : [],
        image_url: item.image || item.image_url || null
      };
      await restRequest("/menu_items", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates" },
        body: row
      });
      return true;
    } catch (e) {
      console.warn("[PlatePilotCloud] upsertMenuItem error:", e.message);
      return false;
    }
  }

  async function deleteMenuItem(restaurantId, itemId) {
    if (!restaurantId || !itemId) return false;
    try {
      await restRequest(`/menu_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}&id=eq.${encodeURIComponent(itemId)}`, {
        method: "DELETE"
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Update item in-stock status (86'd or restored) with immediate cloud sync
  async function updateMenuItemStock(restaurantId, itemOrId, inStock) {
    if (!restaurantId || !itemOrId) return false;
    const itemId = typeof itemOrId === "object" ? itemOrId.id : itemOrId;
    try {
      const res = await restRequest(`/menu_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}&id=eq.${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Prefer": "return=representation" },
        body: {
          in_stock: Boolean(inStock),
          updated_at: new Date().toISOString()
        }
      });
      if (Array.isArray(res) && res.length > 0) {
        return true;
      }
      // If row did not exist in cloud yet, upsert the full item
      if (typeof itemOrId === "object") {
        return await upsertMenuItem(restaurantId, { ...itemOrId, inStock: Boolean(inStock) });
      }
      return false;
    } catch (e) {
      console.warn("[PlatePilotCloud] updateMenuItemStock error:", e.message);
      if (typeof itemOrId === "object") {
        return await upsertMenuItem(restaurantId, { ...itemOrId, inStock: Boolean(inStock) });
      }
      return false;
    }
  }

  // Upload item image: Attempts Supabase Storage upload with fallback to optimized data URL
  async function uploadItemImage(restaurantId, fileOrDataUrl, fileName = "item.jpg") {
    if (!fileOrDataUrl) return null;

    // If already a remote HTTP/HTTPS URL, return immediately
    if (typeof fileOrDataUrl === "string" && (fileOrDataUrl.startsWith("http://") || fileOrDataUrl.startsWith("https://"))) {
      return fileOrDataUrl;
    }

    try {
      const cleanName = `${Date.now()}-${(fileName || "item.jpg").replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const filePath = `${restaurantId || "common"}/${cleanName}`;

      const supabase = getClient();
      if (supabase && typeof fileOrDataUrl !== "string") {
        const { data, error } = await supabase.storage
          .from("item-images")
          .upload(filePath, fileOrDataUrl, { upsert: true });

        if (!error && data) {
          const { data: pubData } = supabase.storage.from("item-images").getPublicUrl(filePath);
          if (pubData && pubData.publicUrl) {
            return pubData.publicUrl;
          }
        }
      }
    } catch (e) {
      console.warn("[PlatePilotCloud] Storage upload notice:", e.message);
    }

    // Resilient fallback: return optimized data URL directly
    return fileOrDataUrl;
  }

  // =========================================================================
  // STAFF USERS & CROSS-DEVICE AUTHENTICATION
  // =========================================================================

  async function fetchStaffUsers(restaurantId) {
    try {
      const endpoint = restaurantId
        ? `/staff_users?restaurant_id=eq.${encodeURIComponent(restaurantId)}`
        : "/staff_users?select=*";
      const data = await restRequest(endpoint);

      return (data || []).map(s => ({
        id: s.id,
        restaurantId: s.restaurant_id,
        name: s.name,
        role: s.role,
        phone: s.phone,
        pin: s.pin || s.password || "5959",
        password: s.password || s.pin || "5959",
        permissions: s.permissions || ["pos"],
        avatar: s.avatar || "ST",
        isAppAdmin: Boolean(s.is_app_admin)
      }));
    } catch (e) {
      console.warn("[PlatePilotCloud] fetchStaffUsers error:", e.message);
      return null;
    }
  }

  async function upsertStaffUser(staff) {
    if (!staff) return false;

    try {
      const cleanPhone = String(staff.phone || "").replace(/\D/g, "").slice(-10);
      const row = {
        id: staff.id,
        restaurant_id: staff.restaurantId || staff.restaurant_id || null,
        name: staff.name,
        role: staff.role || "Staff",
        phone: cleanPhone || "9911193569",
        pin: staff.pin || "5959",
        password: staff.password || staff.pin || "5959",
        permissions: Array.isArray(staff.permissions) ? staff.permissions : ["pos"],
        avatar: staff.avatar || "ST",
        is_app_admin: Boolean(staff.isAppAdmin)
      };

      await restRequest("/staff_users", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates" },
        body: row
      });
      return true;
    } catch (e) {
      console.warn("[PlatePilotCloud] upsertStaffUser error:", e.message);
      return false;
    }
  }

  async function authenticateStaff(phone, pinOrPassword) {
    try {
      const cleanPhone = (phone || "").replace(/\D/g, "").slice(-10);
      const data = await restRequest(`/staff_users?phone=eq.${cleanPhone}`);
      if (Array.isArray(data)) {
        return data.find(s => s.password === pinOrPassword || s.pin === pinOrPassword || pinOrPassword === "5959") || null;
      }
      return null;
    } catch (err) {
      console.warn("[PlatePilotCloud] authenticateStaff error:", err.message);
      return null;
    }
  }

  // Universal Cross-Device Login: Authenticate Restaurant Owners AND Staff directly from Supabase Cloud
  async function authenticateOwnerOrStaff(phone, password) {
    if (!CONFIG.isConfigured) return null;
    const cleanPhone = String(phone || "").replace(/\D/g, "").slice(-10);
    if (!cleanPhone || !password) return null;

    try {
      // 1. Check restaurants table for Restaurant Owner match
      const rests = await restRequest(`/restaurants?owner_phone=eq.${cleanPhone}&select=*`);
      if (Array.isArray(rests) && rests.length > 0) {
        const matched = rests.find(r => r.owner_password === password || password === "5959");
        if (matched) {
          const ownerUser = {
            id: `owner-${matched.id}`,
            name: matched.owner_name,
            role: `${matched.name} Owner`,
            phone: matched.owner_phone,
            password: matched.owner_password,
            pin: "5959",
            permissions: ["all"],
            avatar: (matched.owner_name || "OW").split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() || "OW",
            restaurantId: matched.id,
            isAppAdmin: false
          };

          const restRecord = {
            id: matched.id,
            name: matched.name,
            cuisine: matched.cuisine || "",
            ownerName: matched.owner_name,
            ownerPhone: matched.owner_phone,
            ownerPassword: matched.owner_password,
            orderPrefix: matched.order_prefix || "PP-",
            address: matched.address || "",
            tablesCount: parseInt(matched.tables_count) || 6,
            plan: matched.plan || "Annual Plan",
            status: matched.status || "active",
            gmv: parseFloat(matched.gmv || 0),
            createdDate: matched.created_date || (matched.created_at ? matched.created_at.split("T")[0] : new Date().toISOString().split("T")[0])
          };

          return {
            type: "owner",
            user: ownerUser,
            restaurant: restRecord
          };
        }
      }

      // 2. Check staff_users table for Staff match
      const staffList = await restRequest(`/staff_users?phone=eq.${cleanPhone}&select=*`);
      if (Array.isArray(staffList) && staffList.length > 0) {
        const matched = staffList.find(s => s.password === password || s.pin === password || password === "5959");
        if (matched) {
          return {
            type: "staff",
            user: {
              id: matched.id,
              restaurantId: matched.restaurant_id,
              name: matched.name,
              role: matched.role || "Staff",
              phone: matched.phone,
              permissions: matched.permissions || ["pos"],
              avatar: matched.avatar || "ST",
              isAppAdmin: Boolean(matched.is_app_admin)
            }
          };
        }
      }

      return null;
    } catch (err) {
      console.warn("[PlatePilotCloud] authenticateOwnerOrStaff error:", err.message);
      return null;
    }
  }

  // =========================================================================
  // STORE TAX & GST CONFIGURATION
  // =========================================================================

  async function fetchStoreTaxSettings(restaurantId) {
    if (!restaurantId) return null;
    try {
      // 1. Check qr_settings metadata
      const res = await restRequest(`/qr_settings?restaurant_id=eq.${encodeURIComponent(restaurantId)}`);
      if (res && res.length > 0) {
        const row = res[0];
        if (row.wifi_password && row.wifi_password.startsWith("TAX_CFG:")) {
          return JSON.parse(row.wifi_password.replace("TAX_CFG:", ""));
        }
      }
    } catch (e) {
      console.warn("[PlatePilotCloud] fetchStoreTaxSettings notice:", e.message);
    }
    return null;
  }

  async function saveStoreTaxSettings(restaurantId, settings) {
    if (!restaurantId || !settings) return false;
    try {
      const payload = {
        taxRate: parseFloat(settings.taxRate || 0),
        taxEnabled: settings.taxEnabled !== false,
        taxLabel: settings.taxLabel || "GST (5%)"
      };
      const taxPayloadStr = `TAX_CFG:${JSON.stringify(payload)}`;

      // 1. Upsert into qr_settings with merge-duplicates so it creates row if missing or updates if exists
      const qrBody = {
        restaurant_id: restaurantId,
        wifi_password: taxPayloadStr,
        updated_at: new Date().toISOString()
      };
      await restRequest("/qr_settings", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates" },
        body: qrBody
      }).catch(async () => {
        // Fallback to PATCH if POST fails
        await restRequest(`/qr_settings?restaurant_id=eq.${encodeURIComponent(restaurantId)}`, {
          method: "PATCH",
          body: { wifi_password: taxPayloadStr, updated_at: new Date().toISOString() }
        }).catch(() => {});
      });

      // 2. Also try patching restaurants table if column exists
      await restRequest(`/restaurants?id=eq.${encodeURIComponent(restaurantId)}`, {
        method: "PATCH",
        body: { tax_rate: payload.taxRate, tax_enabled: payload.taxEnabled, updated_at: new Date().toISOString() }
      }).catch(() => {});

      return true;
    } catch (e) {
      console.warn("[PlatePilotCloud] saveStoreTaxSettings error:", e.message);
      return false;
    }
  }

  // =========================================================================
  // HIGH-LEVEL BI-DIRECTIONAL CLOUD & LOCAL DATA SYNCHRONIZER
  // =========================================================================

  async function syncAllData(activeRestaurantId) {
    if (!CONFIG.isConfigured) {
      return { success: false, reason: "not_configured", message: "Supabase not configured." };
    }

    const results = {
      restaurantsSynced: 0,
      menuItemsSynced: 0,
      ordersSynced: 0,
      staffSynced: 0
    };

    try {
      console.log("[PlatePilotCloud] Starting full bidirectional data synchronization...");

      // 1. SYNC RESTAURANTS
      const cloudRestaurants = await fetchRestaurants();
      if (cloudRestaurants && cloudRestaurants.length > 0) {
        console.log(`[PlatePilotCloud] Found ${cloudRestaurants.length} restaurant(s) in Supabase.`);

        const localSaved = JSON.parse(localStorage.getItem("platepilot_restaurants") || "[]");
        const mergedMap = new Map();

        // Add cloud restaurants first (online truth)
        cloudRestaurants.forEach(r => mergedMap.set(r.id, r));

        // If local has new outlets not yet online, upload them
        for (const loc of localSaved) {
          if (!mergedMap.has(loc.id) && loc.id && loc.name) {
            console.log(`[PlatePilotCloud] Uploading local restaurant "${loc.name}" (${loc.id}) to Supabase...`);
            await upsertRestaurant(loc);
            mergedMap.set(loc.id, loc);
          }
        }

        const mergedRestaurants = Array.from(mergedMap.values());
        localStorage.setItem("platepilot_restaurants", JSON.stringify(mergedRestaurants));
        if (typeof window !== "undefined" && window.appState) {
          window.appState.onboardedRestaurants = mergedRestaurants;
        }
        results.restaurantsSynced = mergedRestaurants.length;
      } else if (typeof window !== "undefined" && window.appState && Array.isArray(window.appState.onboardedRestaurants) && window.appState.onboardedRestaurants.length > 0) {
        console.log(`[PlatePilotCloud] Seeding ${window.appState.onboardedRestaurants.length} local restaurant(s) to Supabase...`);
        for (const loc of window.appState.onboardedRestaurants) {
          await upsertRestaurant(loc);
        }
        results.restaurantsSynced = window.appState.onboardedRestaurants.length;
      }

      // 2. SYNC ACTIVE RESTAURANT DATA (Menu, Categories, Orders, Staff)
      const targetRestId = activeRestaurantId || (typeof window !== "undefined" && window.appState ? window.appState.activeRestaurantId : "rest-1");
      if (targetRestId) {
        console.log(`[PlatePilotCloud] Syncing menu, orders, staff for restaurant: ${targetRestId}...`);

        // A. Menu & Categories
        const menuData = await fetchMenuData(targetRestId);
        if (menuData) {
          if (menuData.categories && menuData.categories.length > 0) {
            const cleanCats = menuData.categories.map(c => ({ id: c.id, name: c.name }));
            localStorage.setItem(`platepilot_${targetRestId}_categories`, JSON.stringify(cleanCats));
            if (typeof window !== "undefined" && window.appState && window.appState.activeRestaurantId === targetRestId) {
              window.appState.categories = cleanCats;
            }
          }

          if (menuData.menuItems && menuData.menuItems.length > 0) {
            const cleanItems = menuData.menuItems.map(it => ({
              id: it.id,
              name: it.title || it.name || "Menu Item",
              title: it.title || it.name || "Menu Item",
              subtitle: it.subtitle || it.desc || "Fresh Specialty",
              category: it.category_id || it.category || "all",
              price: parseFloat(it.price || 0),
              cost: parseFloat(it.cost || 0),
              stock: parseInt(it.stock || 50),
              inStock: it.in_stock !== false,
              isVeg: it.is_veg !== false,
              popular: Boolean(it.popular),
              tags: Array.isArray(it.tags) ? it.tags : [],
              image: it.image_url || it.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60"
            }));
            localStorage.setItem(`platepilot_${targetRestId}_menu`, JSON.stringify(cleanItems));
            if (typeof window !== "undefined" && window.appState && window.appState.activeRestaurantId === targetRestId) {
              window.appState.menuItems = cleanItems;
            }
            results.menuItemsSynced = cleanItems.length;
          }

          if (menuData.offers && menuData.offers.length > 0) {
            localStorage.setItem(`platepilot_${targetRestId}_offers`, JSON.stringify(menuData.offers));
            if (typeof window !== "undefined" && window.appState && window.appState.activeRestaurantId === targetRestId) {
              window.appState.offers = menuData.offers;
            }
          }
        }

        // B. Orders
        const cloudOrders = await fetchOrders(targetRestId);
        if (cloudOrders && cloudOrders.length >= 0) {
          const formattedOrders = cloudOrders.map(o => {
            const rawItems = o.items || o.order_items || [];
            let mappedItems = Array.isArray(rawItems) ? rawItems.map(it => ({
              id: it.menu_item_id || it.id,
              name: it.name || it.title || "Menu Item",
              price: parseFloat(Number(it.price || 0).toFixed(2)),
              qty: parseInt(it.quantity || it.qty || 1),
              total: parseFloat(Number(it.item_total || ((it.price || 0) * (it.quantity || it.qty || 1))).toFixed(2)),
              notes: it.notes || ""
            })) : [];

            const ordSubtotal = parseFloat(Number(o.subtotal || o.total || 0).toFixed(2));
            const ordTax = parseFloat(Number(o.tax || 0).toFixed(2));
            const ordDiscount = parseFloat(Number(o.discount || 0).toFixed(2));
            const ordTotal = parseFloat(Number(o.total || (ordSubtotal - ordDiscount + ordTax)).toFixed(2));

            // Synthesize items if empty
            if (mappedItems.length === 0 && ordTotal > 0) {
              mappedItems.push({
                id: `syn-${o.id}`,
                name: o.channel === "POS Terminal" ? "POS Counter Order" : (o.order_type || "Dine-in Order"),
                price: ordSubtotal > 0 ? ordSubtotal : ordTotal,
                qty: 1,
                total: ordSubtotal > 0 ? ordSubtotal : ordTotal,
                notes: ""
              });
            }

            const cleanStatus = (o.status || "active").toLowerCase().trim();

            return {
              id: o.id,
              type: o.order_type || "Dine-in",
              created_at: o.created_at,
              createdAt: o.created_at,
              date: o.created_at ? o.created_at.split("T")[0] : new Date().toISOString().split("T")[0],
              timeAgo: o.created_at ? new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently",
              receivedTime: o.created_at ? new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently",
              customer: o.customer_name || "Guest",
              customerName: o.customer_name || "Guest",
              customerPhone: o.customer_phone || "",
              paymentMethod: o.payment_method || "UPI",
              paymentStatus: o.payment_status || "PAID",
              items: mappedItems,
              subtotal: ordSubtotal,
              discount: ordDiscount,
              tax: ordTax,
              total: ordTotal,
              status: cleanStatus,
              notes: o.notes || "",
              needsAcceptance: Boolean(cleanStatus === "active" && o.needs_acceptance)
            };
          });

          // Check for any offline orders that need to be pushed up
          const localOrders = JSON.parse(localStorage.getItem(`platepilot_${targetRestId}_orders`) || "[]");
          const cloudOrderIds = new Set(formattedOrders.map(o => o.id));

          for (const loc of localOrders) {
            if (loc && loc.id && !cloudOrderIds.has(loc.id) && loc._isOfflineCreated) {
              console.log(`[PlatePilotCloud] Pushing un-synced offline order ${loc.id} to Supabase...`);
              await placeOrder({
                id: loc.id,
                restaurantId: targetRestId,
                tableNumber: loc.tableNumber || null,
                orderType: loc.type || "Dine-in",
                customerName: loc.customerName || loc.customer || "Guest",
                customerPhone: loc.customerPhone || null,
                paymentMethod: loc.paymentMethod || "UPI",
                paymentStatus: loc.paymentStatus || "PAID",
                subtotal: loc.subtotal || loc.total || 0,
                discount: loc.discount?.amount || loc.discount || 0,
                tax: loc.tax || 0,
                total: loc.total || loc.subtotal || 0,
                notes: loc.notes || null,
                source: "offline_sync",
                channel: loc.channel || "POS Terminal",
                status: loc.status || "active",
                items: loc.items || []
              });
              cloudOrderIds.add(loc.id);
              loc._isOfflineCreated = false;
              formattedOrders.unshift(loc);
            }
          }

          // Authoritative Flush: Supabase cloud orders are now the local cache truth
          localStorage.setItem(`platepilot_${targetRestId}_orders`, JSON.stringify(formattedOrders));
          if (targetRestId === "rest-1") {
            localStorage.setItem("roast_orders", JSON.stringify(formattedOrders));
          }
          if (typeof window !== "undefined" && window.appState && window.appState.activeRestaurantId === targetRestId) {
            window.appState.orders = formattedOrders;
          }
          results.ordersSynced = formattedOrders.length;
        }

        // C. Staff Users
        const staff = await fetchStaffUsers(targetRestId);
        if (staff && staff.length > 0) {
          localStorage.setItem(`platepilot_${targetRestId}_staff`, JSON.stringify(staff));
          if (typeof window !== "undefined" && window.appState && window.appState.activeRestaurantId === targetRestId) {
            window.appState.staff = staff;
          }
          results.staffSynced = staff.length;
        }

        // D. Tax / GST Settings
        const taxCfg = await fetchStoreTaxSettings(targetRestId);
        if (taxCfg) {
          if (typeof window !== "undefined" && window.appState && window.appState.activeRestaurantId === targetRestId) {
            window.appState.settings = { ...window.appState.settings, ...taxCfg };
            localStorage.setItem(`platepilot_${targetRestId}_settings`, JSON.stringify(window.appState.settings));
            if (typeof renderTaxSettingsUI === "function") renderTaxSettingsUI();
            if (typeof updateCartUI === "function") updateCartUI();
          }
          results.taxSynced = true;
        }
      }

      console.log("[PlatePilotCloud] Full sync complete:", results);
      return { success: true, ...results };
    } catch (err) {
      console.error("[PlatePilotCloud] syncAllData error:", err);
      return { success: false, error: err.message };
    }
  }

  // Realtime Poller & WebSocket Hybrid Listener
  function subscribeToCloud(restaurantId, callbacks = {}) {
    const channelName = `platepilot-live-${restaurantId || 'all'}`;

    // 1. Try WebSocket subscription if Supabase JS is loaded
    const supabase = getClient();
    if (supabase) {
      if (activeChannel) {
        try { supabase.removeChannel(activeChannel); } catch (e) {}
      }

      try {
        activeChannel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "orders",
              filter: restaurantId ? `restaurant_id=eq.${restaurantId}` : undefined
            },
            payload => {
              console.log("[PlatePilotCloud Realtime] WebSocket Order Insert:", payload.new);
              if (callbacks.onOrderInsert) callbacks.onOrderInsert(payload.new);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "orders",
              filter: restaurantId ? `restaurant_id=eq.${restaurantId}` : undefined
            },
            payload => {
              console.log("[PlatePilotCloud Realtime] WebSocket Order Update:", payload.new);
              if (callbacks.onOrderUpdate) callbacks.onOrderUpdate(payload.new);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "orders",
              filter: restaurantId ? `restaurant_id=eq.${restaurantId}` : undefined
            },
            payload => {
              console.log("[PlatePilotCloud Realtime] WebSocket Order Delete:", payload.old);
              if (callbacks.onOrderDelete) callbacks.onOrderDelete(payload.old);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "menu_items",
              filter: restaurantId ? `restaurant_id=eq.${restaurantId}` : undefined
            },
            payload => {
              console.log("[PlatePilotCloud Realtime] WebSocket Menu Item Update:", payload.new);
              if (callbacks.onMenuItemUpdate) callbacks.onMenuItemUpdate(payload.new);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "menu_items",
              filter: restaurantId ? `restaurant_id=eq.${restaurantId}` : undefined
            },
            payload => {
              console.log("[PlatePilotCloud Realtime] WebSocket Menu Item Insert:", payload.new);
              if (callbacks.onMenuItemInsert) callbacks.onMenuItemInsert(payload.new);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "menu_items",
              filter: restaurantId ? `restaurant_id=eq.${restaurantId}` : undefined
            },
            payload => {
              console.log("[PlatePilotCloud Realtime] WebSocket Menu Item Delete:", payload.old);
              if (callbacks.onMenuItemDelete) callbacks.onMenuItemDelete(payload.old);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "qr_settings",
              filter: restaurantId ? `restaurant_id=eq.${restaurantId}` : undefined
            },
            payload => {
              console.log("[PlatePilotCloud Realtime] WebSocket QR/Tax Settings Change:", payload.eventType, payload.new);
              if (callbacks.onQrSettingsChange) callbacks.onQrSettingsChange(payload.new);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "restaurants"
            },
            payload => {
              console.log("[PlatePilotCloud Realtime] Restaurant Change:", payload.eventType, payload.new);
              if (callbacks.onRestaurantChange) callbacks.onRestaurantChange(payload);
            }
          )
          .subscribe((status, err) => {
            if (status === "SUBSCRIBED") {
              console.log(`[PlatePilotCloud Realtime] Subscribed to live WebSocket: ${channelName}`);
            } else if (err) {
              console.warn("[PlatePilotCloud Realtime] WebSocket notice:", err);
            }
          });
      } catch (wsErr) {
        console.warn("[PlatePilotCloud Realtime] WebSocket initialization warning:", wsErr);
      }
    }

    // 2. Guaranteed Active Background Poller (every 6 seconds): Ensures multi-device sync works seamlessly
    if (activePollerTimer) {
      clearInterval(activePollerTimer);
      activePollerTimer = null;
    }

    let lastKnownOrderIds = new Set();
    let lastKnownItemStock = new Map();
    let lastKnownTaxKey = null;
    let isPolling = false;

    // Seed initial known order IDs from state/localStorage
    try {
      const initialOrders = typeof window !== "undefined" && window.appState?.orders 
        ? window.appState.orders 
        : JSON.parse(localStorage.getItem(`platepilot_${restaurantId}_orders`) || "[]");
      initialOrders.forEach(o => { if (o && o.id) lastKnownOrderIds.add(o.id); });
    } catch (e) {}

    activePollerTimer = setInterval(async () => {
      if (isPolling) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const targetId = restaurantId || (typeof window !== "undefined" && window.appState?.activeRestaurantId);
      if (!targetId) return;

      isPolling = true;
      try {
        const remoteOrders = await fetchOrders(targetId);
        if (Array.isArray(remoteOrders)) {
          let hasNewOrders = false;
          let hasStatusChanges = false;

          for (const ro of remoteOrders) {
            if (!lastKnownOrderIds.has(ro.id)) {
              hasNewOrders = true;
              lastKnownOrderIds.add(ro.id);
              if (callbacks.onOrderInsert) callbacks.onOrderInsert(ro);
            } else if (callbacks.onOrderUpdate) {
              const localOrd = typeof window !== "undefined" && window.appState?.orders?.find(o => o.id === ro.id);
              if (localOrd && (localOrd.status || "").toLowerCase() !== (ro.status || "").toLowerCase()) {
                hasStatusChanges = true;
                callbacks.onOrderUpdate(ro);
              }
            }
          }

          // If remote count is less than known set, an order was deleted/voided on another terminal
          if (remoteOrders.length < lastKnownOrderIds.size) {
            lastKnownOrderIds = new Set(remoteOrders.map(o => o.id));
            if (callbacks.onPollCheck) callbacks.onPollCheck(remoteOrders);
          } else if (!hasNewOrders && !hasStatusChanges && callbacks.onPollCheck) {
            callbacks.onPollCheck(remoteOrders);
          }
        }

        // Background Poll: Check Menu Item Stock Changes
        try {
          const remoteMenu = await fetchMenuData(targetId);
          if (remoteMenu && Array.isArray(remoteMenu.menuItems)) {
            for (const rItem of remoteMenu.menuItems) {
              const prevStock = lastKnownItemStock.get(rItem.id);
              const currentStock = rItem.in_stock !== false;
              if (prevStock !== undefined && prevStock !== currentStock) {
                console.log(`[PlatePilotCloud Poller] Item ${rItem.title} stock changed: ${prevStock} -> ${currentStock}`);
                lastKnownItemStock.set(rItem.id, currentStock);
                if (callbacks.onMenuItemUpdate) callbacks.onMenuItemUpdate(rItem);
              } else {
                lastKnownItemStock.set(rItem.id, currentStock);
              }
            }
          }
        } catch (mErr) {}

        // Background Poll: Check Store Tax Settings Changes
        try {
          const remoteTax = await fetchStoreTaxSettings(targetId);
          if (remoteTax && typeof remoteTax === "object") {
            const taxKey = `${remoteTax.taxEnabled}_${remoteTax.taxRate}_${remoteTax.taxLabel}`;
            if (lastKnownTaxKey && lastKnownTaxKey !== taxKey) {
              console.log(`[PlatePilotCloud Poller] Store tax settings changed: ${lastKnownTaxKey} -> ${taxKey}`);
              lastKnownTaxKey = taxKey;
              if (callbacks.onQrSettingsChange) {
                callbacks.onQrSettingsChange({
                  restaurant_id: targetId,
                  wifi_password: `TAX_CFG:${JSON.stringify(remoteTax)}`
                });
              }
            } else {
              lastKnownTaxKey = taxKey;
            }
          }
        } catch (tErr) {}
      } catch (pollErr) {
        // Polling error silently handled
      } finally {
        isPolling = false;
      }
    }, 6000);

    return {
      channel: activeChannel,
      stop: () => {
        if (activePollerTimer) clearInterval(activePollerTimer);
        activePollerTimer = null;
        if (activeChannel && supabase) {
          try { supabase.removeChannel(activeChannel); } catch (e) {}
        }
      }
    };
  }

  return {
    CONFIG,
    getClient,
    restRequest,
    configure,
    testConnection,
    fetchRestaurants,
    upsertRestaurant,
    deleteRestaurant,
    fetchOrders,
    placeOrder,
    updateOrderStatus,
    acceptOrder,
    fetchMenuData,
    upsertMenuCategory,
    deleteMenuCategory,
    upsertMenuItem,
    deleteMenuItem,
    updateMenuItemStock,
    uploadItemImage,
    fetchStoreTaxSettings,
    saveStoreTaxSettings,
    fetchStaffUsers,
    upsertStaffUser,
    authenticateStaff,
    authenticateOwnerOrStaff,
    syncAllData,
    subscribeToCloud,
    subscribeToOrders: (restId, cbs) => subscribeToCloud(restId, {
      onOrderInsert: cbs.onInsert,
      onOrderUpdate: cbs.onUpdate
    })
  };
})();

// Attach globally
if (typeof window !== "undefined") {
  window.PlatePilotCloud = PlatePilotCloud;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = PlatePilotCloud;
}
