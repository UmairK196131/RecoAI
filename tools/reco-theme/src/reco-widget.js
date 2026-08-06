/**
 * RecoAI storefront recommendation widget (vanilla JS).
 * Fetches /api/recommendations, renders grid/carousel, tracks impressions/clicks.
 * On API failure or empty results: hides the block (NFR-AVAIL-02).
 */
(function () {
  "use strict";

  var IMG_SIZE = 600;
  var FETCH_TIMEOUT_MS = 8000;

  function qs(el, sel) {
    return el.querySelector(sel);
  }

  function hideBlock(root) {
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
  }

  function showBlock(root) {
    root.hidden = false;
    root.removeAttribute("aria-hidden");
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMoney(centsOrAmount, moneyFormat) {
    var amount = parseFloat(centsOrAmount);
    if (Number.isNaN(amount)) return "";

    // Shopify money_format uses {{amount}} placeholders; amounts from API are dollars.
    var value = amount.toFixed(2);
    var format = moneyFormat || "${{amount}}";

    return format
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, value.replace(".", ","))
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, String(Math.round(amount)))
      .replace(/\{\{\s*amount\s*\}\}/g, value);
  }

  function getSessionId() {
    if (window.RecoAI && typeof window.RecoAI.getSessionId === "function") {
      var sid = window.RecoAI.getSessionId();
      if (sid) return sid;
    }
    try {
      return localStorage.getItem("recoai_sid");
    } catch (e) {
      return null;
    }
  }

  function track(eventType, metadata) {
    if (window.RecoAI && typeof window.RecoAI.track === "function") {
      window.RecoAI.track(eventType, metadata || {});
    }
  }

  function parseCartProductIds(callback) {
    if (typeof fetch !== "function") {
      callback([]);
      return;
    }
    fetch("/cart.js", { credentials: "same-origin" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (cart) {
        if (!cart || !cart.items) {
          callback([]);
          return;
        }
        var ids = [];
        cart.items.forEach(function (item) {
          if (item.product_id) ids.push(String(item.product_id));
        });
        callback(ids);
      })
      .catch(function () {
        callback([]);
      });
  }

  function buildApiUrl(root, cartProductIds) {
    var apiBase = (root.getAttribute("data-api-url") || "").replace(/\/$/, "");
    var shop = root.getAttribute("data-shop") || "";
    if (!apiBase || !shop) return null;

    var placement = root.getAttribute("data-placement-type") || "product_page";
    var itemCount = root.getAttribute("data-item-count") || "4";
    var productId = root.getAttribute("data-product-id") || "";
    var sessionId = getSessionId();

    var url = new URL(apiBase + "/api/recommendations");
    url.searchParams.set("shop", shop);
    url.searchParams.set("placement_type", placement);
    if (productId) url.searchParams.set("product_id", productId);
    if (sessionId) url.searchParams.set("session_id", sessionId);
    if (cartProductIds && cartProductIds.length) {
      url.searchParams.set("cart_product_ids", cartProductIds.join(","));
    }
    return url.toString();
  }

  function fetchRecommendations(url, callback) {
    if (typeof fetch !== "function") {
      callback(null);
      return;
    }

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, FETCH_TIMEOUT_MS);

    fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        callback(data);
      })
      .catch(function () {
        clearTimeout(timer);
        callback(null);
      });
  }

  function renderCard(item, opts) {
    var title = escapeHtml(item.title || "");
    var url = item.url || (item.handle ? "/products/" + encodeURIComponent(item.handle) : null);
    var image = item.image_url || "";
    var priceHtml = "";
    var atcHtml = "";
    var ariaLabel = "View " + (item.title || "product");

    if (opts.showPrice && item.price != null && item.price !== "") {
      priceHtml =
        '<p class="recoai-card__price">' +
        escapeHtml(formatMoney(item.price, opts.moneyFormat)) +
        "</p>";
    }

    if (opts.showAtc && item.variant_id) {
      atcHtml =
        '<button type="button" class="recoai-card__atc" data-recoai-atc data-variant-id="' +
        escapeHtml(item.variant_id) +
        '" data-product-id="' +
        escapeHtml(item.product_id || "") +
        '">Add to cart</button>';
    }

    var mediaInner = image
      ? '<img class="recoai-card__image" src="' +
        escapeHtml(image) +
        '" alt="' +
        title +
        '" width="' +
        IMG_SIZE +
        '" height="' +
        IMG_SIZE +
        '" loading="lazy" decoding="async" />'
      : '<span class="recoai-card__image recoai-card__image--placeholder" aria-hidden="true"></span>';

    var media = url
      ? '<a class="recoai-card__media" href="' +
        escapeHtml(url) +
        '" data-recoai-product-link data-product-id="' +
        escapeHtml(item.product_id || "") +
        '" aria-label="' +
        escapeHtml(ariaLabel) +
        '">' +
        mediaInner +
        "</a>"
      : '<div class="recoai-card__media">' + mediaInner + "</div>";

    var titleEl = url
      ? '<a class="recoai-card__title" href="' +
        escapeHtml(url) +
        '" data-recoai-product-link data-product-id="' +
        escapeHtml(item.product_id || "") +
        '">' +
        title +
        "</a>"
      : '<span class="recoai-card__title">' + title + "</span>";

    return (
      '<article class="recoai-card" data-product-id="' +
      escapeHtml(item.product_id || "") +
      '">' +
      media +
      '<div class="recoai-card__body">' +
      titleEl +
      priceHtml +
      atcHtml +
      "</div></article>"
    );
  }

  function renderGrid(items, opts) {
    var cols = String(opts.columns || "4");
    var html =
      '<div class="recoai-grid" data-columns="' +
      escapeHtml(cols) +
      '" style="--recoai-cols: ' +
      escapeHtml(cols) +
      '">';
    items.forEach(function (item) {
      html += renderCard(item, opts);
    });
    html += "</div>";
    return html;
  }

  function renderCarousel(items, opts) {
    var html =
      '<div class="recoai-carousel" data-recoai-carousel>' +
      '<button type="button" class="recoai-carousel__arrow recoai-carousel__arrow--prev" data-recoai-prev aria-label="Previous recommendations">' +
      '<span aria-hidden="true">&#10094;</span></button>' +
      '<div class="recoai-carousel__track" data-recoai-track tabindex="0" role="list">';

    items.forEach(function (item) {
      html +=
        '<div class="recoai-carousel__slide" role="listitem">' +
        renderCard(item, opts) +
        "</div>";
    });

    html +=
      "</div>" +
      '<button type="button" class="recoai-carousel__arrow recoai-carousel__arrow--next" data-recoai-next aria-label="Next recommendations">' +
      '<span aria-hidden="true">&#10095;</span></button>' +
      "</div>";
    return html;
  }

  function bindCarousel(root) {
    var carousel = qs(root, "[data-recoai-carousel]");
    if (!carousel) return;
    var track = qs(carousel, "[data-recoai-track]");
    var prev = qs(carousel, "[data-recoai-prev]");
    var next = qs(carousel, "[data-recoai-next]");
    if (!track) return;

    function scrollByCard(dir) {
      var slide = qs(track, ".recoai-carousel__slide");
      var amount = slide ? slide.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
      track.scrollBy({ left: dir * amount, behavior: "smooth" });
    }

    if (prev) {
      prev.addEventListener("click", function () {
        scrollByCard(-1);
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        scrollByCard(1);
      });
    }
  }

  function bindInteractions(root, items, placement) {
    root.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;

      var atc = target.closest("[data-recoai-atc]");
      if (atc) {
        event.preventDefault();
        var variantId = atc.getAttribute("data-variant-id");
        var productId = atc.getAttribute("data-product-id");
        if (!variantId) return;

        track("recommendation_click", {
          productId: productId,
          placement: placement,
          action: "add_to_cart",
        });

        var body = new FormData();
        body.append("id", variantId);
        body.append("quantity", "1");
        fetch("/cart/add.js", {
          method: "POST",
          body: body,
          credentials: "same-origin",
        }).catch(function () {
          /* silent — shopper can still use product page */
        });
        return;
      }

      var link = target.closest("[data-recoai-product-link]");
      if (link) {
        track("recommendation_click", {
          productId: link.getAttribute("data-product-id"),
          placement: placement,
          action: "product_link",
        });
      }
    });

    // Impression once when rendered
    track("recommendation_impression", {
      placement: placement,
      productIds: items.map(function (item) {
        return item.product_id;
      }),
      count: items.length,
    });
  }

  function mountWidget(root) {
    if (root.getAttribute("data-recoai-mounted") === "1") return;
    root.setAttribute("data-recoai-mounted", "1");

    var content = qs(root, "[data-recoai-content]");
    if (!content) {
      hideBlock(root);
      return;
    }

    var heading = root.getAttribute("data-heading") || "";
    var headingEl = qs(root, ".recoai-block__heading");
    if (headingEl) {
      if (heading) {
        headingEl.textContent = heading;
        headingEl.hidden = false;
      } else {
        headingEl.hidden = true;
      }
    }

    var layout = root.getAttribute("data-layout") || "grid";
    var columns = root.getAttribute("data-columns") || "4";
    var showPrice = root.getAttribute("data-show-price") === "true";
    var showAtc = root.getAttribute("data-show-atc") === "true";
    var moneyFormat = root.getAttribute("data-money-format") || "${{amount}}";
    var placement = root.getAttribute("data-placement-type") || "product_page";
    var itemCount = parseInt(root.getAttribute("data-item-count") || "4", 10) || 4;

    var opts = {
      showPrice: showPrice,
      showAtc: showAtc,
      moneyFormat: moneyFormat,
      columns: columns,
    };

    function onCartIds(cartProductIds) {
      var url = buildApiUrl(root, cartProductIds);
      if (!url) {
        hideBlock(root);
        return;
      }

      fetchRecommendations(url, function (data) {
        if (!data || !Array.isArray(data.recommendations) || !data.recommendations.length) {
          hideBlock(root);
          return;
        }

        var items = data.recommendations.slice(0, itemCount);
        if (!items.length) {
          hideBlock(root);
          return;
        }

        content.innerHTML =
          layout === "carousel" ? renderCarousel(items, opts) : renderGrid(items, opts);

        if (layout === "carousel") bindCarousel(root);
        bindInteractions(root, items, placement);
        showBlock(root);
      });
    }

    if (placement === "cart") {
      parseCartProductIds(onCartIds);
    } else {
      onCartIds([]);
    }
  }

  function initAll(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    var widgets = root.querySelectorAll
      ? root.querySelectorAll("[data-recoai-widget]")
      : [];
    if (scope && scope.matches && scope.matches("[data-recoai-widget]")) {
      mountWidget(scope);
    }
    for (var i = 0; i < widgets.length; i++) {
      mountWidget(widgets[i]);
    }
  }

  function boot() {
    if (window.__recoaiWidgetBooted) {
      // Extra script tags (multiple blocks): still mount any new roots
      initAll(document);
      return;
    }
    window.__recoaiWidgetBooted = true;

    initAll(document);

    document.addEventListener("shopify:section:load", function (event) {
      var section = event.target;
      if (!section) return;
      var nodes = section.querySelectorAll
        ? section.querySelectorAll("[data-recoai-widget]")
        : [];
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].removeAttribute("data-recoai-mounted");
        mountWidget(nodes[i]);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
