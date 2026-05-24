/**
 * Zero Gravity — Security & Anti-Scraping Shield
 *
 * Layers of protection applied:
 *  1. Bot / headless-browser detection  (canvas, WebGL, navigator checks)
 *  2. Client-side rate limiting         (per-endpoint token-bucket)
 *  3. Request fingerprinting guard      (rapid identical requests blocked)
 *  4. Email obfuscation                 (deobfuscates at render time only)
 *  5. DevTools detection                (slows down automated inspection)
 *  6. Clipboard / view-source guard     (soft barrier for casual scrapers)
 *  7. Content Security Policy meta tag  (injected at runtime)
 *  8. Honeypot request trap             (flags & throttles bot behaviour)
 */
(function () {
  "use strict";

  // Resolve and apply theme as early as possible to prevent flash of light mode
  try {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  } catch (e) {
    console.error("[ZG Security] Theme initialization failed:", e);
  }


  /* ═══════════════════════════════════════════════════════════════════
     1. BOT / HEADLESS BROWSER DETECTION
     Uses multiple signals — any single check can be spoofed but the
     combination raises the bar significantly.
  ═══════════════════════════════════════════════════════════════════ */
  const BOT_FLAGS = {
    noWebGL       : false,
    noCanvas      : false,
    webDriverSet  : false,
    noPlugins     : false,
    noTouchOnMobile: false,
    suspiciousUA  : false,
    noLanguages   : false,
  };

  function runBotDetection() {
    const nav = navigator;

    // webdriver flag — always true in Puppeteer/Selenium/Playwright unless patched
    if (nav.webdriver === true) BOT_FLAGS.webDriverSet = true;

    // Headless browsers usually have no plugins
    if (nav.plugins && nav.plugins.length === 0) BOT_FLAGS.noPlugins = true;

    // Languages array missing → PhantomJS / old headless
    if (!nav.languages || nav.languages.length === 0) BOT_FLAGS.noLanguages = true;

    // Suspicious user-agent strings
    const ua = (nav.userAgent || "").toLowerCase();
    const botUAPatterns = [
      "headless", "phantomjs", "selenium", "webdriver", "puppeteer",
      "playwright", "scrapy", "crawl", "spider", "bot", "wget", "curl",
    ];
    if (botUAPatterns.some((p) => ua.includes(p))) BOT_FLAGS.suspiciousUA = true;

    // Canvas fingerprint — headless engines often return blank or fixed hashes
    try {
      const canvas = document.createElement("canvas");
      const ctx    = canvas.getContext("2d");
      if (!ctx) {
        BOT_FLAGS.noCanvas = true;
      } else {
        ctx.textBaseline = "top";
        ctx.font         = "14px Arial";
        ctx.fillText("ZeroGravity🚀", 2, 2);
        const data = canvas.toDataURL();
        // A valid browser produces a non-empty, non-trivial data URL
        if (!data || data.length < 100) BOT_FLAGS.noCanvas = true;
      }
    } catch (_) {
      BOT_FLAGS.noCanvas = true;
    }

    // WebGL — headless or VM environments often lack GPU context
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      if (!gl) BOT_FLAGS.noWebGL = true;
    } catch (_) {
      BOT_FLAGS.noWebGL = true;
    }

    return BOT_FLAGS;
  }

  function getBotScore() {
    const flags  = Object.values(BOT_FLAGS);
    const hits   = flags.filter(Boolean).length;
    return hits; // 0 = clean, 4+ = very likely bot
  }

  function isSuspectedBot() {
    return getBotScore() >= 3;
  }

  /* ═══════════════════════════════════════════════════════════════════
     2. CLIENT-SIDE RATE LIMITING  (token-bucket per endpoint key)
     Prevents a single browser tab from hammering Supabase endpoints
     (e.g., a script that loops fetch calls).
  ═══════════════════════════════════════════════════════════════════ */
  const buckets = new Map();

  /**
   * Check if a call is allowed under the rate limit.
   * @param {string} key       - logical endpoint identifier
   * @param {number} maxCalls  - allowed calls per window
   * @param {number} windowMs  - rolling window size
   * @returns {boolean} true if allowed
   */
  function rateAllow(key, maxCalls = 10, windowMs = 60_000) {
    const now    = Date.now();
    let   bucket = buckets.get(key);

    if (!bucket) {
      bucket = { calls: [], blocked: false };
      buckets.set(key, bucket);
    }

    // Evict calls outside the window
    bucket.calls = bucket.calls.filter((t) => now - t < windowMs);

    if (bucket.calls.length >= maxCalls) {
      bucket.blocked = true;
      return false;
    }

    bucket.calls.push(now);
    bucket.blocked = false;
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════════
     3. REQUEST FINGERPRINT GUARD
     Detects suspiciously rapid, identical XHR/fetch patterns that
     indicate automated scraping. Patches globalThis.fetch to intercept.
  ═══════════════════════════════════════════════════════════════════ */
  const recentURLs  = [];
  const MAX_SAME_URL_BURST = 4;
  const BURST_WINDOW_MS    = 3_000;

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function securedFetch(input, init) {
    const url     = typeof input === "string" ? input : input?.url || "";
    const isZGReq = url.includes("supabase.co");

    if (isZGReq) {
      // 3a. Rate-limit Supabase requests globally: 30/min
      if (!rateAllow("supabase-global", 30, 60_000)) {
        console.warn("[ZG Security] Supabase rate limit exceeded — request blocked.");
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status : 429,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 3b. Burst detection — same URL hit too many times in 3s
      const now = Date.now();
      recentURLs.push({ url, ts: now });
      const burst = recentURLs.filter(
        (r) => r.url === url && now - r.ts < BURST_WINDOW_MS
      );
      if (burst.length > MAX_SAME_URL_BURST) {
        console.warn("[ZG Security] Burst request pattern detected — slowing down.");
        // Exponential back-off: wait before passing through
        await new Promise((r) => setTimeout(r, burst.length * 500));
      }

      // Prune old entries
      while (recentURLs.length > 200) recentURLs.shift();
    }

    return _originalFetch(input, init);
  };

  /* ═══════════════════════════════════════════════════════════════════
     4. EMAIL OBFUSCATION
     Emails stored as ROT13 in data-email attributes are decoded and
     rendered only in the browser — invisible to most scrapers.
  ═══════════════════════════════════════════════════════════════════ */
  function rot13(str) {
    return str.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  }

  function deobfuscateEmails() {
    document.querySelectorAll("[data-email]").forEach((el) => {
      const encoded = el.getAttribute("data-email");
      if (!encoded) return;
      const address = rot13(encoded);
      el.setAttribute("href", `mailto:${address}`);
      if (!el.textContent.trim() || el.textContent.includes("@")) {
        el.textContent = address;
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     5. DEVTOOLS DETECTION
     When DevTools is open, a debugger statement fires 10× per second
     and dramatically slows automated inspection of the app state.
     This does NOT affect normal users (debugger never pauses them).
  ═══════════════════════════════════════════════════════════════════ */
  let devToolsOpen = false;

  function detectDevTools() {
    const threshold = 160;
    const widthGap  = window.outerWidth  - window.innerWidth  > threshold;
    const heightGap = window.outerHeight - window.innerHeight > threshold;
    devToolsOpen = widthGap || heightGap;
  }

  function trapDevTools() {
    // Only activates if we already suspect a bot
    if (!isSuspectedBot()) return;
    detectDevTools();
    if (devToolsOpen) {
      // eslint-disable-next-line no-debugger
      debugger;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     6. CLIPBOARD / VIEW-SOURCE GUARD
     Soft barriers — easy to bypass but stop casual scraping tools
     that rely on copy-paste or direct source viewing.
  ═══════════════════════════════════════════════════════════════════ */
  function installContentGuard() {
    // Disable right-click context menu on sensitive containers
    document.querySelectorAll(".member-card, .contact-form, [data-protected]").forEach((el) => {
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    // Intercept clipboard on form fields that contain personal data
    document.addEventListener("copy", (e) => {
      const sel = window.getSelection()?.toString() || "";
      // If the copied text looks like an email, obfuscate it
      if (/@\w+\.\w+/.test(sel)) {
        e.clipboardData?.setData("text/plain", sel.replace(/@/g, " [at] "));
        e.preventDefault();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     7. CONTENT SECURITY POLICY (meta tag)
     Restricts what scripts/styles/images can be loaded, reducing the
     attack surface for injected scraping scripts.
  ═══════════════════════════════════════════════════════════════════ */
  function injectCSP() {
    if (document.querySelector("meta[http-equiv='Content-Security-Policy']")) return;

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://pmytmilrzojhhwfaatxf.supabase.co https://fonts.googleapis.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    const meta = document.createElement("meta");
    meta.setAttribute("http-equiv", "Content-Security-Policy");
    meta.setAttribute("content", csp);
    document.head.prepend(meta);
  }

  /* ═══════════════════════════════════════════════════════════════════
     8. HONEYPOT TRAP
     A hidden form field. Bots that auto-fill forms will set it;
     the submit handler then silently drops the submission.
  ═══════════════════════════════════════════════════════════════════ */
  function installHoneypots() {
    document.querySelectorAll("form").forEach((form) => {
      if (form.querySelector(".zg-hp")) return; // already installed

      // Hidden field — real users never see or fill it
      const hp = document.createElement("input");
      hp.type        = "text";
      hp.name        = "website"; // common bot-targeted field name
      hp.className   = "zg-hp";
      hp.tabIndex    = -1;
      hp.autocomplete = "off";
      hp.style.cssText = "position:absolute;left:-9999px;height:0;width:0;opacity:0;pointer-events:none;";
      form.appendChild(hp);

      // Check honeypot on submit
      form.addEventListener("submit", (e) => {
        if (hp.value.trim() !== "") {
          e.preventDefault();
          e.stopImmediatePropagation();
          console.warn("[ZG Security] Honeypot triggered — bot submission blocked.");
        }
      }, { capture: true });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════════════════════ */
  function init() {
    runBotDetection();
    injectCSP();
    deobfuscateEmails();
    installContentGuard();
    installHoneypots();

    // If highly suspected bot: throttle all subsequent fetch calls
    if (isSuspectedBot()) {
      const originalFetch = window.fetch;
      window.fetch = async function botThrottle(...args) {
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
        return originalFetch(...args);
      };
      console.warn("[ZG Security] Suspected bot — network requests throttled.");
    }

    // DevTools trap runs on a low-frequency interval (only if bot suspected)
    if (isSuspectedBot()) {
      setInterval(trapDevTools, 100);
    }
  }

  // Run as early as possible
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-run honeypot install after any dynamic form injection
  const _formObserver = new MutationObserver(() => installHoneypots());
  _formObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree  : true,
  });

  /* ── Public API ── */
  window.ZGSecurity = Object.freeze({
    isSuspectedBot,
    getBotScore,
    rateAllow,
    /** Re-decode obfuscated emails (call after dynamic content injection). */
    deobfuscateEmails,
  });
})();
