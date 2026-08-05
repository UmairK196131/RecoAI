/**
 * RecoAI storefront tracking script (vanilla JS, no dependencies).
 * Batches events and POSTs to /api/events; respects Shopify Customer Privacy API.
 */
(function () {
  "use strict";

  var config = window.__recoai;
  if (!config || !config.shop) return;

  var SESSION_KEY = "recoai_sid";
  var SESSION_MAX_AGE = 60 * 60 * 24 * 30;
  var BATCH_SIZE = 10;
  var FLUSH_INTERVAL_MS = 5000;

  var ANALYTICS_EVENTS = {
    product_view: true,
    collection_view: true,
    search: true,
    add_to_cart: true,
    remove_from_cart: true,
    checkout_start: true,
    purchase: true,
    recommendation_impression: true,
  };

  var MARKETING_EVENTS = {
    recommendation_click: true,
  };

  var queue = [];
  var flushTimer = null;
  var sessionId = null;
  var consentReady = false;
  var analyticsAllowed = false;
  var marketingAllowed = false;

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function readCookie(name) {
    var match = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
    );
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(name, value, maxAge) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; path=/; max-age=" +
      maxAge +
      "; SameSite=Lax" +
      secure;
  }

  function clearSessionStorage() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      /* localStorage unavailable */
    }
    document.cookie = SESSION_KEY + "=; path=/; max-age=0; SameSite=Lax";
    sessionId = null;
  }

  function ensureSessionId() {
    if (!analyticsAllowed) return null;

    if (sessionId) return sessionId;

    var id = readCookie(SESSION_KEY);
    if (!id) {
      try {
        id = localStorage.getItem(SESSION_KEY);
      } catch (e) {
        /* localStorage unavailable */
      }
    }
    if (!id) {
      id = uuid();
    }

    writeCookie(SESSION_KEY, id, SESSION_MAX_AGE);
    try {
      localStorage.setItem(SESSION_KEY, id);
    } catch (e) {
      /* localStorage unavailable */
    }

    sessionId = id;
    return sessionId;
  }

  function readConsentState() {
    var privacy = window.Shopify && window.Shopify.customerPrivacy;
    if (!privacy) {
      analyticsAllowed = true;
      marketingAllowed = true;
      return;
    }

    if (typeof privacy.analyticsProcessingAllowed === "function") {
      analyticsAllowed = privacy.analyticsProcessingAllowed();
    } else if (typeof privacy.userCanBeTracked === "function") {
      analyticsAllowed = privacy.userCanBeTracked();
    } else {
      analyticsAllowed = true;
    }

    if (typeof privacy.marketingAllowed === "function") {
      marketingAllowed = privacy.marketingAllowed();
    } else {
      marketingAllowed = analyticsAllowed;
    }
  }

  function isEventAllowed(eventType) {
    if (MARKETING_EVENTS[eventType]) {
      return marketingAllowed;
    }
    if (ANALYTICS_EVENTS[eventType]) {
      return analyticsAllowed;
    }
    return analyticsAllowed;
  }

  function onConsentChange() {
    var wasAnalytics = analyticsAllowed;
    readConsentState();
    consentReady = true;

    if (!analyticsAllowed) {
      clearSessionStorage();
      queue = [];
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      return;
    }

    if (!wasAnalytics && analyticsAllowed) {
      ensureSessionId();
      initTracking();
    }
  }

  function loadCustomerPrivacyApi(callback) {
    if (window.Shopify && window.Shopify.customerPrivacy) {
      callback();
      return;
    }

    if (!window.Shopify || typeof window.Shopify.loadFeatures !== "function") {
      analyticsAllowed = true;
      marketingAllowed = true;
      consentReady = true;
      callback();
      return;
    }

    window.Shopify.loadFeatures(
      [{ name: "consent-tracking-api", version: "0.1" }],
      function (error) {
        if (error) {
          analyticsAllowed = true;
          marketingAllowed = true;
        } else {
          readConsentState();
        }
        consentReady = true;
        callback();
      }
    );
  }

  function getApiEndpoint() {
    var base = config.apiUrl;
    if (!base) return null;
    return base.replace(/\/$/, "") + "/api/events";
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flushQueue();
    }, FLUSH_INTERVAL_MS);
  }

  function flushQueue() {
    if (!queue.length) return;

    var endpoint = getApiEndpoint();
    var batch = queue.splice(0, queue.length);

    if (!endpoint) {
      if (typeof console !== "undefined" && console.log) {
        console.log("[RecoAI] flush (no apiUrl)", batch);
      }
      return;
    }

    var payload = JSON.stringify({
      shop: config.shop,
      events: batch,
    });

    var sent = false;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
      } catch (e) {
        sent = false;
      }
    }

    if (!sent && typeof fetch === "function") {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        credentials: "omit",
      }).catch(function () {
        queue = batch.concat(queue);
      });
    }
  }

  function enqueueFlush() {
    if (queue.length >= BATCH_SIZE) {
      flushQueue();
      return;
    }
    scheduleFlush();
  }

  function track(eventType, metadata) {
    if (!consentReady || !isEventAllowed(eventType)) {
      return null;
    }

    var sid = ensureSessionId();
    if (!sid) return null;

    var event = {
      eventType: eventType,
      shop: config.shop,
      sessionId: sid,
      customerId: analyticsAllowed && config.customerId ? String(config.customerId) : null,
      timestamp: new Date().toISOString(),
      metadata: metadata || {},
    };

    queue.push(event);
    if (typeof console !== "undefined" && console.log) {
      console.log("[RecoAI]", eventType, event);
    }
    enqueueFlush();
    return event;
  }

  function capturePageView() {
    var pageType = config.pageType;

    if (pageType === "product" && config.productId) {
      track("product_view", { productId: String(config.productId) });
      return;
    }

    if (pageType === "collection" && config.collectionId) {
      track("collection_view", { collectionId: String(config.collectionId) });
      return;
    }

    if (pageType === "search" && config.searchQuery) {
      track("search", { query: config.searchQuery });
      return;
    }

    if (config.orderId) {
      track("purchase", { orderId: String(config.orderId) });
    }
  }

  function parseCartUrl(input) {
    if (typeof input === "string") return input;
    if (input && typeof input.url === "string") return input.url;
    if (input && input.href) return input.href;
    return "";
  }

  function handleCartAddResponse(response) {
    if (!response || !response.ok) return;
    response
      .clone()
      .json()
      .then(function (data) {
        track("add_to_cart", {
          variantId: data.variant_id ? String(data.variant_id) : data.id ? String(data.id) : null,
          productId: data.product_id ? String(data.product_id) : null,
          quantity: data.quantity || 1,
        });
      })
      .catch(function () {
        track("add_to_cart", {});
      });
  }

  function handleCartChangeResponse(response) {
    if (!response || !response.ok) return;
    response
      .clone()
      .json()
      .then(function (data) {
        var item = data && data.items_changed && data.items_changed[0];
        if (item && item.quantity === 0) {
          track("remove_from_cart", {
            variantId: item.variant_id ? String(item.variant_id) : null,
            productId: item.product_id ? String(item.product_id) : null,
          });
        }
      })
      .catch(function () {
        /* ignore parse errors */
      });
  }

  function patchFetch() {
    if (!window.fetch) return;
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = parseCartUrl(input);
      var isAdd = url.indexOf("/cart/add") !== -1;
      var isChange = url.indexOf("/cart/change") !== -1 || url.indexOf("/cart/update") !== -1;

      return originalFetch.apply(this, arguments).then(function (response) {
        if (isAdd) handleCartAddResponse(response);
        if (isChange) handleCartChangeResponse(response);
        return response;
      });
    };
  }

  function patchXHR() {
    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__recoaiUrl = url;
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      var url = xhr.__recoaiUrl || "";

      xhr.addEventListener("load", function () {
        if (xhr.status < 200 || xhr.status >= 300) return;
        if (url.indexOf("/cart/add") !== -1) {
          try {
            var data = JSON.parse(xhr.responseText);
            track("add_to_cart", {
              variantId: data.variant_id ? String(data.variant_id) : data.id ? String(data.id) : null,
              productId: data.product_id ? String(data.product_id) : null,
              quantity: data.quantity || 1,
            });
          } catch (e) {
            track("add_to_cart", {});
          }
        }
        if (url.indexOf("/cart/change") !== -1 || url.indexOf("/cart/update") !== -1) {
          try {
            var cart = JSON.parse(xhr.responseText);
            var items = cart.items || [];
            items.forEach(function (item) {
              if (item.quantity === 0) {
                track("remove_from_cart", {
                  variantId: item.variant_id ? String(item.variant_id) : null,
                  productId: item.product_id ? String(item.product_id) : null,
                });
              }
            });
          } catch (e) {
            /* ignore */
          }
        }
      });

      return originalSend.apply(this, arguments);
    };
  }

  function bindCheckoutTracking() {
    document.addEventListener(
      "click",
      function (event) {
        var target = event.target;
        if (!target || !target.closest) return;
        var el = target.closest(
          'a[href*="/checkout"], button[name="checkout"], input[name="checkout"], [data-recoai-checkout]'
        );
        if (el) {
          track("checkout_start", {});
        }
      },
      true
    );
  }

  var trackingInitialized = false;

  function initTracking() {
    if (trackingInitialized || !analyticsAllowed) return;
    trackingInitialized = true;
    ensureSessionId();
    capturePageView();
    patchFetch();
    patchXHR();
    bindCheckoutTracking();
  }

  function bindLifecycle() {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        flushQueue();
      }
    });
    window.addEventListener("pagehide", flushQueue);
  }

  function start() {
    bindLifecycle();

    document.addEventListener("visitorConsentCollected", function () {
      onConsentChange();
    });

    loadCustomerPrivacyApi(function () {
      onConsentChange();
      if (analyticsAllowed) {
        initTracking();
      }
    });
  }

  window.RecoAI = {
    track: track,
    getSessionId: function () {
      return sessionId;
    },
    getQueue: function () {
      return queue.slice();
    },
    flush: flushQueue,
    hasAnalyticsConsent: function () {
      return analyticsAllowed;
    },
    hasMarketingConsent: function () {
      return marketingAllowed;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
