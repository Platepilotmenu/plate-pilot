/**
 * Plate Pilot - Frontend REST API Client
 * Provides seamless connectivity between the browser UI and the Node.js backend
 */

const PlatePilotAPI = (() => {
  const API_BASE = "http://localhost:5000/api";
  let inMemoryToken = null;

  function getToken() {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("platepilot_token") || inMemoryToken;
    }
    return inMemoryToken;
  }

  function setToken(token) {
    inMemoryToken = token;
    if (typeof localStorage !== "undefined") {
      if (token) {
        localStorage.setItem("platepilot_token", token);
      } else {
        localStorage.removeItem("platepilot_token");
      }
    }
  }

  async function request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(url, {
        ...options,
        headers
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `HTTP error! status: ${res.status}`);
      }

      return data;
    } catch (err) {
      console.warn(`[PlatePilotAPI] ${options.method || 'GET'} ${endpoint} failed:`, err.message);
      throw err;
    }
  }

  return {
    baseURL: API_BASE,
    getToken,
    setToken,

    // Health
    checkHealth: () => request("/health"),

    // Auth
    login: async (phone, password) => {
      const res = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, password })
      });
      if (res.token) setToken(res.token);
      return res;
    },
    pinLogin: async (restaurantId, pin) => {
      const res = await request("/auth/pin", {
        method: "POST",
        body: JSON.stringify({ restaurantId, pin })
      });
      if (res.token) setToken(res.token);
      return res;
    },
    getMe: () => request("/auth/me"),
    logout: () => setToken(null),

    // Super Admin Central (App Owner Only)
    admin: {
      getMetrics: () => request("/admin/metrics"),
      getRestaurants: (status = "all", search = "") =>
        request(`/admin/restaurants?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`),
      onboardRestaurant: (data) => request("/admin/restaurants", { method: "POST", body: JSON.stringify(data) }),
      updateRestaurant: (id, data) => request(`/admin/restaurants/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      toggleStatus: (id) => request(`/admin/restaurants/${id}/status`, { method: "PATCH" }),
      deleteRestaurant: (id) => request(`/admin/restaurants/${id}`, { method: "DELETE" }),
      impersonate: async (id) => {
        const res = await request(`/admin/impersonate/${id}`, { method: "POST" });
        if (res.token) setToken(res.token);
        return res;
      }
    },

    // Restaurant Profile & Settings
    restaurants: {
      get: (id) => request(`/restaurants/${id}`),
      update: (id, data) => request(`/restaurants/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      getQrSettings: (id) => request(`/restaurants/${id}/qr-settings`),
      updateQrSettings: (id, data) => request(`/restaurants/${id}/qr-settings`, { method: "PUT", body: JSON.stringify(data) })
    },

    // Menu & Categories
    menu: {
      getCategories: (restId) => request(`/restaurants/${restId}/categories`),
      createCategory: (restId, name) => request(`/restaurants/${restId}/categories`, { method: "POST", body: JSON.stringify({ name }) }),
      deleteCategory: (restId, categoryId) => request(`/restaurants/${restId}/categories/${categoryId}`, { method: "DELETE" }),
      getItems: (restId, category = "all", search = "") =>
        request(`/restaurants/${restId}/menu?category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}`),
      createItem: (restId, item) => request(`/restaurants/${restId}/menu`, { method: "POST", body: JSON.stringify(item) }),
      updateItem: (restId, itemId, item) => request(`/restaurants/${restId}/menu/${itemId}`, { method: "PUT", body: JSON.stringify(item) }),
      toggleStock: (restId, itemId, inStock, stock) =>
        request(`/restaurants/${restId}/menu/${itemId}/stock`, { method: "PATCH", body: JSON.stringify({ inStock, stock }) }),
      deleteItem: (restId, itemId) => request(`/restaurants/${restId}/menu/${itemId}`, { method: "DELETE" })
    },

    // Orders & POS
    orders: {
      list: (restId, status = "all") => request(`/restaurants/${restId}/orders?status=${encodeURIComponent(status)}`),
      create: (restId, orderData) => request(`/restaurants/${restId}/orders`, { method: "POST", body: JSON.stringify(orderData) }),
      getById: (restId, orderId) => request(`/restaurants/${restId}/orders/${orderId}`),
      updateStatus: (restId, orderId, status) =>
        request(`/restaurants/${restId}/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
      getMetrics: (restId) => request(`/restaurants/${restId}/dashboard-metrics`)
    },

    // Offers & Discounts
    offers: {
      list: (restId) => request(`/restaurants/${restId}/offers`),
      create: (restId, offer) => request(`/restaurants/${restId}/offers`, { method: "POST", body: JSON.stringify(offer) }),
      update: (restId, offerId, offer) => request(`/restaurants/${restId}/offers/${offerId}`, { method: "PUT", body: JSON.stringify(offer) }),
      delete: (restId, offerId) => request(`/restaurants/${restId}/offers/${offerId}`, { method: "DELETE" }),
      validate: (restId, code, subtotal) =>
        request(`/restaurants/${restId}/offers/validate`, { method: "POST", body: JSON.stringify({ code, subtotal }) })
    },

    // Staff Management
    staff: {
      list: (restId) => request(`/restaurants/${restId}/staff`),
      create: (restId, staffData) => request(`/restaurants/${restId}/staff`, { method: "POST", body: JSON.stringify(staffData) }),
      update: (restId, staffId, staffData) => request(`/restaurants/${restId}/staff/${staffId}`, { method: "PUT", body: JSON.stringify(staffData) }),
      delete: (restId, staffId) => request(`/restaurants/${restId}/staff/${staffId}`, { method: "DELETE" })
    },

    // Public Customer QR Dining
    qr: {
      getTableMenu: (restId, tableNum) => request(`/qr/${restId}/table/${tableNum}`),
      placeOrder: (restId, orderData) => request(`/qr/${restId}/order`, { method: "POST", body: JSON.stringify(orderData) }),
      trackOrder: (orderId) => request(`/qr/order/${orderId}`)
    }
  };
})();

// Export for module or global browser use
if (typeof module !== "undefined" && module.exports) {
  module.exports = PlatePilotAPI;
} else if (typeof window !== "undefined") {
  window.PlatePilotAPI = PlatePilotAPI;
}
