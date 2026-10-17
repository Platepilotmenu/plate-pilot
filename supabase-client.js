/**
 * Plate Pilot - Supabase Cloud Database Client & Realtime Sync Engine
 * Enables live multi-device synchronization over the internet between Merchant POS and QR Menu
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
        .limit(1);

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

  // Subscribe to Realtime changes on Orders
  function subscribeToOrders(restaurantId, callbacks = {}) {
    const supabase = getClient();
    if (!supabase) return null;

    if (activeChannel) {
      try { supabase.removeChannel(activeChannel); } catch (e) {}
    }

    const channelName = `orders-live-${restaurantId || 'all'}`;
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
          if (callbacks.onInsert) callbacks.onInsert(payload.new);
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
          if (callbacks.onUpdate) callbacks.onUpdate(payload.new);
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

  return {
    CONFIG,
    getClient,
    configure,
    testConnection,
    fetchOrders,
    placeOrder,
    updateOrderStatus,
    subscribeToOrders,
    fetchMenuData,
    authenticateStaff
  };
})();

// Attach globally
window.PlatePilotCloud = PlatePilotCloud;
