/**
 * Plate Pilot - Supabase Cloud Database Client & Realtime Sync Engine
 * Enables live multi-device synchronization over the internet between Merchant POS, QR Menu, and Tablet
 */

const PlatePilotCloud = (() => {
  // Default project credentials (can also be saved via Settings in localStorage)
  const savedConfig = (() => {
    try {
      return JSON.parse(localStorage.getItem("platepilot_supabase_config") || "{}");
    } catch (e) {
      return {};
    }
  })();

  const urlParams = (() => {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return new URLSearchParams();
    }
  })();

  const initialUrl = (urlParams.get("sb_url") || urlParams.get("supabase_url") || savedConfig.url || "").trim();
  const initialKey = (urlParams.get("sb_key") || urlParams.get("supabase_key") || savedConfig.anonKey || "").trim();

  if (initialUrl && initialKey && (!savedConfig.url || !savedConfig.anonKey)) {
    try {
      localStorage.setItem("platepilot_supabase_config", JSON.stringify({ url: initialUrl, anonKey: initialKey }));
    } catch (e) {}
  }

  const CONFIG = {
    url: initialUrl, // Project URL (e.g., https://abcdefghijkl.supabase.co)
    anonKey: initialKey, // Project Anon Public Key
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

  // Initialize Supabase client
  function getClient() {
    if (clientInstance) return clientInstance;
    if (!CONFIG.isConfigured) return null;

    if (typeof window.supabase !== "undefined" && window.supabase.createClient) {
      clientInstance = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 10 } }
      });
      return clientInstance;
    }

    console.warn("[PlatePilotCloud] Supabase JS library not loaded. Ensure @supabase/supabase-js is included.");
    return null;
  }

  // Update credentials dynamically
  function configure(url, anonKey) {
    CONFIG.url = (url || "").trim();
    CONFIG.anonKey = (anonKey || "").trim();
    localStorage.setItem("platepilot_supabase_config", JSON.stringify({
      url: CONFIG.url,
      anonKey: CONFIG.anonKey
    }));
    clientInstance = null;
    return getClient();
  }

  // Check health and connection to Supabase
  async function testConnection() {
    const supabase = getClient();
    if (!supabase) {
      return { 
        connected: false, 
        message: "Supabase credentials not configured. Using local offline storage." 
      };
    }

    try {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, status")
        .limit(5);

      if (error) throw error;
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
    const supabase = getClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
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

  // Upsert a restaurant record to Supabase
  async function upsertRestaurant(r) {
    const supabase = getClient();
    if (!supabase || !r || !r.id) return null;

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

      const { data, error } = await supabase
        .from("restaurants")
        .upsert(row, { onConflict: "id" })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("[PlatePilotCloud] upsertRestaurant error:", err.message);
      return null;
    }
  }

  // Delete a restaurant record from Supabase
  async function deleteRestaurant(restaurantId) {
    const supabase = getClient();
    if (!supabase || !restaurantId) return false;

    try {
      const { error } = await supabase
        .from("restaurants")
        .delete()
        .eq("id", restaurantId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.warn("[PlatePilotCloud] deleteRestaurant error:", err.message);
      return false;
    }
  }

  // =========================================================================
  // ORDERS API & REALTIME SYNC
  // =========================================================================

  // Fetch all orders for a restaurant
  async function fetchOrders(restaurantId = "rest-1") {
    const supabase = getClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          items:order_items(*)
        `)
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn("[PlatePilotCloud] fetchOrders error:", err.message);
      return null;
    }
  }

  // Place a new order from POS or QR Menu
  async function placeOrder(orderData) {
    const supabase = getClient();
    if (!supabase) return null;

    try {
      const orderRecord = {
        id: orderData.id,
        restaurant_id: orderData.restaurantId || "rest-1",
        table_number: orderData.tableNumber || null,
        order_type: orderData.orderType || orderData.type || "Dine-in",
        customer_name: orderData.customerName || orderData.customer || "Guest",
        customer_phone: orderData.customerPhone || null,
        payment_method: orderData.paymentMethod || "UPI",
        payment_status: orderData.paymentStatus || "PAID",
        status: orderData.status || "active",
        subtotal: parseFloat(orderData.subtotal || orderData.total || 0),
        discount: parseFloat(orderData.discount?.amount || orderData.discount || 0),
        tax: parseFloat(orderData.tax || 0),
        total: parseFloat(orderData.total || orderData.subtotal || 0),
        notes: orderData.notes || orderData.note || null,
        source: orderData.source || "qr",
        channel: orderData.channel || "QR Table Order",
        needs_acceptance: Boolean(orderData.needsAcceptance)
      };

      const { data: insertedOrder, error: orderErr } = await supabase
        .from("orders")
        .insert(orderRecord)
        .select()
        .single();

      if (orderErr) throw orderErr;

      // Insert line items
      if (Array.isArray(orderData.items) && orderData.items.length > 0) {
        const itemRows = orderData.items.map(it => ({
          order_id: orderData.id,
          restaurant_id: orderData.restaurantId || "rest-1",
          menu_item_id: it.id || null,
          name: it.name || it.title || "Menu Item",
          price: parseFloat(it.price || 0),
          quantity: parseInt(it.qty || it.quantity || 1),
          item_total: parseFloat(((it.price || 0) * (it.qty || it.quantity || 1)).toFixed(2)),
          notes: it.notes || it.note || null,
          tags: it.tags || [],
          is_done: Boolean(it.done || it.is_done)
        }));

        const { error: itemsErr } = await supabase
          .from("order_items")
          .insert(itemRows);

        if (itemsErr) {
          console.warn("[PlatePilotCloud] Error inserting items:", itemsErr.message);
        }
      }

      return insertedOrder;
    } catch (err) {
      console.error("[PlatePilotCloud] placeOrder error:", err.message);
      return null;
    }
  }

  // Update order status (e.g. active -> ready -> done)
  async function updateOrderStatus(orderId, status) {
    const supabase = getClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("[PlatePilotCloud] updateOrderStatus error:", err.message);
      return null;
    }
  }

  // =========================================================================
  // MENU & CATEGORIES API
  // =========================================================================
  async function fetchMenuData(restaurantId = "rest-1") {
    const supabase = getClient();
    if (!supabase) return null;

    try {
      const [catsRes, itemsRes, offersRes] = await Promise.all([
        supabase.from("menu_categories").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
        supabase.from("menu_items").select("*").eq("restaurant_id", restaurantId),
        supabase.from("offers").select("*").eq("restaurant_id", restaurantId).eq("active", true)
      ]);

      return {
        categories: catsRes.data || [],
        menuItems: itemsRes.data || [],
        offers: offersRes.data || []
      };
    } catch (err) {
      console.warn("[PlatePilotCloud] fetchMenuData error:", err.message);
      return null;
    }
  }

  async function upsertMenuCategory(restaurantId, cat) {
    const supabase = getClient();
    if (!supabase || !restaurantId || !cat) return false;
    try {
      const row = {
        id: cat.id,
        restaurant_id: restaurantId,
        name: cat.name,
        sort_order: parseInt(cat.sort_order || cat.sortOrder || 0)
      };
      const { error } = await supabase.from("menu_categories").upsert(row, { onConflict: "restaurant_id,id" });
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn("[PlatePilotCloud] upsertMenuCategory error:", e.message);
      return false;
    }
  }

  async function deleteMenuCategory(restaurantId, catId) {
    const supabase = getClient();
    if (!supabase || !restaurantId || !catId) return false;
    try {
      const { error } = await supabase.from("menu_categories").delete().match({ restaurant_id: restaurantId, id: catId });
      if (error) throw error;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function upsertMenuItem(restaurantId, item) {
    const supabase = getClient();
    if (!supabase || !restaurantId || !item) return false;
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
      const { error } = await supabase.from("menu_items").upsert(row, { onConflict: "restaurant_id,id" });
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn("[PlatePilotCloud] upsertMenuItem error:", e.message);
      return false;
    }
  }

  async function deleteMenuItem(restaurantId, itemId) {
    const supabase = getClient();
    if (!supabase || !restaurantId || !itemId) return false;
    try {
      const { error } = await supabase.from("menu_items").delete().match({ restaurant_id: restaurantId, id: itemId });
      if (error) throw error;
      return true;
    } catch (e) {
      return false;
    }
  }

  // =========================================================================
  // STAFF USERS API
  // =========================================================================
  async function fetchStaffUsers(restaurantId) {
    const supabase = getClient();
    if (!supabase) return null;

    try {
      let query = supabase.from("staff_users").select("*");
      if (restaurantId) query = query.eq("restaurant_id", restaurantId);
      const { data, error } = await query;
      if (error) throw error;

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
    const supabase = getClient();
    if (!supabase || !staff) return false;

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

      const { error } = await supabase.from("staff_users").upsert(row, { onConflict: "id" });
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn("[PlatePilotCloud] upsertStaffUser error:", e.message);
      return false;
    }
  }

  // =========================================================================
  // AUTHENTICATION (PHONE & PIN)
  // =========================================================================
  async function authenticateStaff(phone, pinOrPassword) {
    const supabase = getClient();
    if (!supabase) return null;

    try {
      const cleanPhone = (phone || "").replace(/\D/g, "").slice(-10);
      const { data, error } = await supabase
        .from("staff_users")
        .select("*")
        .eq("phone", cleanPhone)
        .or(`pin.eq.${pinOrPassword},password.eq.${pinOrPassword}`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("[PlatePilotCloud] authenticateStaff error:", err.message);
      return null;
    }
  }

  // =========================================================================
  // HIGH-LEVEL BI-DIRECTIONAL CLOUD & LOCAL DATA SYNCHRONIZER
  // =========================================================================
  async function syncAllData(activeRestaurantId) {
    const supabase = getClient();
    if (!supabase) {
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

        // Merge cloud restaurants with any local ones that haven't been pushed yet
        const localSaved = JSON.parse(localStorage.getItem("platepilot_restaurants") || "[]");
        const mergedMap = new Map();

        // 1A. Add cloud restaurants first (online truth)
        cloudRestaurants.forEach(r => mergedMap.set(r.id, r));

        // 1B. If local has restaurants not yet online, push them up to Supabase
        for (const loc of localSaved) {
          if (!mergedMap.has(loc.id) && loc.id && loc.name) {
            console.log(`[PlatePilotCloud] Uploading local restaurant "${loc.name}" (${loc.id}) to Supabase...`);
            await upsertRestaurant(loc);
            mergedMap.set(loc.id, loc);
          }
        }

        const mergedRestaurants = Array.from(mergedMap.values());
        localStorage.setItem("platepilot_restaurants", JSON.stringify(mergedRestaurants));
        if (window.appState) {
          window.appState.onboardedRestaurants = mergedRestaurants;
        }
        results.restaurantsSynced = mergedRestaurants.length;
      } else if (window.appState && Array.isArray(window.appState.onboardedRestaurants) && window.appState.onboardedRestaurants.length > 0) {
        // Cloud has no restaurants yet, push local restaurants up to seed the cloud database!
        console.log(`[PlatePilotCloud] Cloud has 0 restaurants. Seeding ${window.appState.onboardedRestaurants.length} restaurant(s) to Supabase...`);
        for (const loc of window.appState.onboardedRestaurants) {
          await upsertRestaurant(loc);
        }
        results.restaurantsSynced = window.appState.onboardedRestaurants.length;
      }

      // 2. SYNC ACTIVE RESTAURANT DATA (Menu, Categories, Orders, Staff)
      const targetRestId = activeRestaurantId || (window.appState ? window.appState.activeRestaurantId : "rest-1");
      if (targetRestId) {
        console.log(`[PlatePilotCloud] Syncing menu, orders, staff for restaurant: ${targetRestId}...`);

        // A. Menu & Categories
        const menuData = await fetchMenuData(targetRestId);
        if (menuData) {
          // Categories
          if (menuData.categories && menuData.categories.length > 0) {
            const cleanCats = menuData.categories.map(c => ({ id: c.id, name: c.name }));
            localStorage.setItem(`platepilot_${targetRestId}_categories`, JSON.stringify(cleanCats));
            if (window.appState && window.appState.activeRestaurantId === targetRestId) {
              window.appState.categories = cleanCats;
            }
          } else if (window.appState && Array.isArray(window.appState.categories) && window.appState.categories.length > 0) {
            for (const cat of window.appState.categories) {
              await upsertMenuCategory(targetRestId, cat);
            }
          }

          // Menu Items
          if (menuData.menuItems && menuData.menuItems.length > 0) {
            const cleanItems = menuData.menuItems.map(it => ({
              id: it.id,
              name: it.title || it.name,
              category: it.category_id || it.category || "all",
              price: parseFloat(it.price || 0),
              cost: parseFloat(it.cost || 0),
              stock: parseInt(it.stock || 50),
              inStock: it.in_stock !== false,
              isVeg: it.is_veg !== false,
              popular: Boolean(it.popular),
              tags: it.tags || [],
              image: it.image_url || it.image || ""
            }));
            localStorage.setItem(`platepilot_${targetRestId}_menu`, JSON.stringify(cleanItems));
            if (window.appState && window.appState.activeRestaurantId === targetRestId) {
              window.appState.menuItems = cleanItems;
            }
            results.menuItemsSynced = cleanItems.length;
          } else if (window.appState && Array.isArray(window.appState.menuItems) && window.appState.menuItems.length > 0) {
            for (const it of window.appState.menuItems) {
              await upsertMenuItem(targetRestId, it);
            }
            results.menuItemsSynced = window.appState.menuItems.length;
          }

          // Offers
          if (menuData.offers && menuData.offers.length > 0) {
            localStorage.setItem(`platepilot_${targetRestId}_offers`, JSON.stringify(menuData.offers));
            if (window.appState && window.appState.activeRestaurantId === targetRestId) {
              window.appState.offers = menuData.offers;
            }
          }
        }

        // B. Orders
        const cloudOrders = await fetchOrders(targetRestId);
        if (cloudOrders && cloudOrders.length > 0) {
          const formattedOrders = cloudOrders.map(o => ({
            id: o.id,
            type: o.order_type || "Dine-in",
            timeAgo: new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            receivedTime: new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            customer: o.customer_name || "Guest",
            customerPhone: o.customer_phone || "",
            paymentMethod: o.payment_method || "UPI",
            paymentStatus: o.payment_status || "PAID",
            items: (o.items || []).map(it => ({
              id: it.menu_item_id || it.id,
              name: it.name,
              price: parseFloat(it.price || 0),
              qty: parseInt(it.quantity || 1),
              notes: it.notes || ""
            })),
            subtotal: parseFloat(o.subtotal || o.total || 0),
            discount: parseFloat(o.discount || 0),
            tax: parseFloat(o.tax || 0),
            total: parseFloat(o.total || 0),
            status: o.status || "active",
            notes: o.notes || "",
            needsAcceptance: Boolean(o.needs_acceptance)
          }));

          // Merge cloud orders with local orders (preserving any local active orders)
          const localOrders = JSON.parse(localStorage.getItem(`platepilot_${targetRestId}_orders`) || "[]");
          const orderMap = new Map();
          formattedOrders.forEach(o => orderMap.set(o.id, o));
          localOrders.forEach(o => {
            if (!orderMap.has(o.id)) orderMap.set(o.id, o);
          });

          const mergedOrders = Array.from(orderMap.values());
          localStorage.setItem(`platepilot_${targetRestId}_orders`, JSON.stringify(mergedOrders));
          if (window.appState && window.appState.activeRestaurantId === targetRestId) {
            window.appState.orders = mergedOrders;
          }
          results.ordersSynced = mergedOrders.length;
        }

        // C. Staff Users
        const staff = await fetchStaffUsers(targetRestId);
        if (staff && staff.length > 0) {
          localStorage.setItem(`platepilot_${targetRestId}_staff`, JSON.stringify(staff));
          if (window.appState && window.appState.activeRestaurantId === targetRestId) {
            window.appState.staff = staff;
          }
          results.staffSynced = staff.length;
        }
      }

      console.log("[PlatePilotCloud] Full sync complete:", results);
      return { success: true, ...results };
    } catch (err) {
      console.error("[PlatePilotCloud] syncAllData error:", err);
      return { success: false, error: err.message };
    }
  }

  // Subscribe to Realtime changes on Orders & Restaurants
  function subscribeToCloud(restaurantId, callbacks = {}) {
    const supabase = getClient();
    if (!supabase) return null;

    if (activeChannel) {
      try { supabase.removeChannel(activeChannel); } catch (e) {}
    }

    const channelName = `platepilot-live-${restaurantId || 'all'}`;
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
          console.log("[PlatePilotCloud Realtime] New Order Received:", payload.new);
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
          console.log("[PlatePilotCloud Realtime] Order Status Changed:", payload.new);
          if (callbacks.onOrderUpdate) callbacks.onOrderUpdate(payload.new);
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
          console.log("[PlatePilotCloud Realtime] Restaurant Table Changed:", payload.eventType, payload.new);
          if (callbacks.onRestaurantChange) {
            callbacks.onRestaurantChange(payload);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log(`[PlatePilotCloud Realtime] Subscribed to live cloud channel: ${channelName}`);
        } else if (err) {
          console.warn("[PlatePilotCloud Realtime] Subscription warning:", err);
        }
      });

    return activeChannel;
  }

  return {
    CONFIG,
    getClient,
    configure,
    testConnection,
    fetchRestaurants,
    upsertRestaurant,
    deleteRestaurant,
    fetchOrders,
    placeOrder,
    updateOrderStatus,
    fetchMenuData,
    upsertMenuCategory,
    deleteMenuCategory,
    upsertMenuItem,
    deleteMenuItem,
    fetchStaffUsers,
    upsertStaffUser,
    authenticateStaff,
    syncAllData,
    subscribeToCloud,
    // Alias for backwards compatibility
    subscribeToOrders: (restId, cbs) => subscribeToCloud(restId, {
      onOrderInsert: cbs.onInsert,
      onOrderUpdate: cbs.onUpdate
    })
  };
})();

// Attach globally
window.PlatePilotCloud = PlatePilotCloud;
