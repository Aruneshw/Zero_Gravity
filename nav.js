const navigationLinks = [
  { label: "Home", href: "./index.html" },
  { label: "About Us", href: "./about.html" },
  { label: "Services", href: "./services.html" },
  { label: "Projects", href: "./projects.html" },
  { label: "Problem Hub", href: "./problem-hub.html" },
  { label: "Join With Us", href: "./join.html" },
];

const policyLinks = [
  { label: "Privacy Policy", href: "./privacy.html" },
  { label: "Terms & Conditions", href: "./terms.html" },
];

const socialLinks = [
  {
    label: "GitHub",
    href: "https://github.com/teamzerogravityorg",
    type: "github",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/zero-gravity-688356400/?isSelfProfile=true",
    type: "linkedin",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/teamzero_gravity/",
    type: "instagram",
  },
];

function getSiteRoot() {
  const rawRoot =
    document.documentElement?.dataset.siteRoot ||
    document.body?.dataset.siteRoot ||
    window.ZERO_GRAVITY_SITE_ROOT ||
    "./";

  return rawRoot.endsWith("/") ? rawRoot : `${rawRoot}/`;
}

function withSiteRoot(path) {
  if (/^(https?:|mailto:|tel:|#)/.test(path)) {
    return path;
  }

  const cleanPath = path.replace(/^\.\//, "");
  return `${getSiteRoot()}${cleanPath}`;
}

function normalizePathname(pathname) {
  const cleaned = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const file = cleaned.split("/").filter(Boolean).pop();
  return file || "index.html";
}

function normalizeComparablePath(pathname) {
  const cleaned = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  return cleaned.replace(/\/+/g, "/");
}

function isActiveNavTarget(href) {
  const targetPath = normalizeComparablePath(new URL(href, window.location.href).pathname);
  const currentPath = normalizeComparablePath(window.location.pathname);

  if (targetPath === currentPath) {
    return true;
  }

  const currentSegments = window.location.pathname.split("/").filter(Boolean);
  const targetFile = normalizePathname(targetPath);

  return targetFile === "about.html" && currentSegments.includes("about");
}

function getSocialIcon(type) {
  const icons = {
    github:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.11.79-.25.79-.56v-2.17c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.71 1.26 3.37.97.1-.75.4-1.27.72-1.56-2.55-.29-5.23-1.27-5.23-5.67 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.41-2.68 5.37-5.24 5.66.41.36.78 1.08.78 2.18v3.24c0 .31.2.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>',
    linkedin:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5ZM3 9h4v12H3V9Zm7 0h3.83v1.71h.05c.53-1 1.84-2.06 3.79-2.06 4.05 0 4.8 2.66 4.8 6.11V21h-4v-5.62c0-1.34-.02-3.06-1.87-3.06-1.88 0-2.16 1.47-2.16 2.97V21h-4V9Z"/></svg>',
    instagram:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5Zm8.93 1.35a1.12 1.12 0 1 1 0 2.24 1.12 1.12 0 0 1 0-2.24ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8A3.2 3.2 0 1 0 12 15.2 3.2 3.2 0 0 0 12 8.8Z"/></svg>',
  };

  return icons[type] || "";
}

function createNavLinks(className = "nav-link") {
  return navigationLinks
    .map(
      ({ label, href }, index) =>
        `<a class="${className}" href="${withSiteRoot(href)}" style="--nav-index:${index}">${label}</a>`
    )
    .join("");
}

function injectSiteChrome() {
  const navMount = document.getElementById("site-nav");
  const footerMount = document.getElementById("site-footer");

  if (navMount) {
    navMount.innerHTML = `
      <header class="site-nav">
        <div class="nav-inner">
          <a class="brand" href="${withSiteRoot("./index.html")}" aria-label="Team Zero Gravity home">
            <span class="logo-badge brand-logo-shell" aria-hidden="true">
              <img class="brand-logo" src="${withSiteRoot("./LOGO.png")}" alt="Team Zero Gravity logo" />
            </span>
            <span class="brand-wordmark">ZERO GRAVITY</span>
          </a>
          <nav class="nav-links" aria-label="Primary navigation">
            ${createNavLinks()}
          </nav>
          <div class="nav-actions">
            <div class="auth-slot desktop-auth" id="nav-auth-desktop"></div>
            <button class="nav-signin" type="button" data-auth-action="signin">Sign in with Google</button>
            <a class="nav-cta" href="${withSiteRoot("./join.html#registration-process")}">Join Now</a>
            <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open navigation menu">☰</button>
          </div>
        </div>
      </header>
      <nav class="nav-overlay" id="mobile-nav" aria-label="Mobile navigation">
        ${createNavLinks("nav-link mobile-nav-link")}
        <a class="nav-cta" href="${withSiteRoot("./join.html#registration-process")}">Join Now</a>
        <button class="nav-signin mobile-nav-signin" type="button" data-auth-action="signin">Sign in with Google</button>
        <div class="auth-slot mobile-auth" id="nav-auth-mobile"></div>
      </nav>
    `;
  }

  if (footerMount) {
    footerMount.innerHTML = `
      <footer class="site-footer">
        <div class="footer-inner">
          <div class="footer-grid">
            <div class="footer-brand-col">
              <a class="brand" href="${withSiteRoot("./index.html")}" aria-label="Team Zero Gravity home">
                <span class="logo-badge brand-logo-shell" aria-hidden="true">
                  <img class="brand-logo" src="${withSiteRoot("./LOGO.png")}" alt="Team Zero Gravity logo" />
                </span>
                <span class="brand-wordmark">ZERO GRAVITY</span>
              </a>
              <p class="footer-copy footer-tagline">Tech Freelance Ecosystem · Tamil Nadu, India 🇮🇳</p>
              <p class="footer-copy">Connecting clients with student developers to solve real-world tech problems.</p>
            </div>
            <div class="footer-policy-col">
              <h3 class="footer-title">Policies</h3>
              <p class="footer-copy footer-policy-note">Clear guidelines for visitors, enquiries, and member applications.</p>
              <div class="footer-links">
                ${policyLinks
                  .map(({ label, href }) => `<a href="${withSiteRoot(href)}">${label}</a>`)
                  .join("")}
              </div>
            </div>
            <div class="footer-connect-col">
              <h3 class="footer-title">Social Media</h3>
              <div class="footer-social-grid">
                ${socialLinks
                  .map(
                    ({ label, href, type }) => `
                      <a class="social-card" href="${href}" target="_blank" rel="noreferrer" aria-label="Team Zero Gravity ${label}">
                        <span class="social-card-icon">
                          ${getSocialIcon(type)}
                        </span>
                        <span class="social-card-label">${label}</span>
                      </a>
                    `
                  )
                  .join("")}
              </div>
              <div class="footer-contact-info" style="margin-top: 1.5rem;">
                <h4 style="font-size: 0.875rem; color: rgba(255,255,255,0.5); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Reach Us</h4>
                <p class="footer-meta" style="margin-bottom: 0.25rem;">📧 <a href="mailto:teamzerogravityorg@gmail.com">teamzerogravityorg@gmail.com</a></p>
                <p class="footer-meta" style="margin-bottom: 0.25rem;">📞 <a href="tel:+919095736279">+91 90957 36279</a></p>
                <p class="footer-meta" style="margin-bottom: 0.25rem;">📞 <a href="tel:+917539988669">+91 75399 88669</a></p>
                <p class="footer-meta">📍 Tamil Nadu, India</p>
              </div>
            </div>
          </div>
          <div class="footer-visitor-strip" aria-live="polite">
            <div class="visitor-badge">
              <span class="visitor-pulse" aria-hidden="true"></span>
              <p class="visitor-copy">
                <span class="visitor-count" data-visitor-count>0</span>
                visitors have explored Team Zero Gravity so far.
              </p>
            </div>
          </div>
          <div class="footer-bottom">
            <span>© 2026 Team Zero Gravity. All rights reserved.</span>
            <div class="theme-selector-wrap">
              <span class="theme-selector-label">Theme</span>
              <div class="theme-pill-switch">
                <button class="theme-pill-btn" data-theme-btn="light" aria-label="Switch to light mode">
                  <span class="theme-pill-icon">☀️</span> Light
                </button>
                <button class="theme-pill-btn" data-theme-btn="dark" aria-label="Switch to dark mode">
                  <span class="theme-pill-icon">🌙</span> Dark
                </button>
              </div>
            </div>
            <span>Built with ☕ + 🔥 from Tamil Nadu</span>
          </div>
        </div>
      </footer>
    `;
  }
}

function markActiveLinks() {
  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href");
    if (isActiveNavTarget(href)) {
      link.classList.add("active");
    }
  });
}

function setupMobileMenu() {
  const toggle = document.querySelector(".nav-toggle");
  const overlay = document.querySelector(".nav-overlay");

  if (!toggle || !overlay) {
    return;
  }

  const closeMenu = () => {
    overlay.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  };

  toggle.addEventListener("click", () => {
    const shouldOpen = !overlay.classList.contains("is-open");
    overlay.classList.toggle("is-open", shouldOpen);
    toggle.setAttribute("aria-expanded", String(shouldOpen));
    document.body.classList.toggle("menu-open", shouldOpen);
  });

  overlay.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeMenu();
    }
  });
}

function initThemeSwitcher() {
  const lightBtn = document.querySelector('[data-theme-btn="light"]');
  const darkBtn = document.querySelector('[data-theme-btn="dark"]');
  if (!lightBtn || !darkBtn) return;

  const updateThemeUI = (theme) => {
    if (theme === "dark") {
      darkBtn.classList.add("active");
      lightBtn.classList.remove("active");
    } else {
      lightBtn.classList.add("active");
      darkBtn.classList.remove("active");
    }
  };

  // Determine active theme
  const getActiveTheme = () => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  // Initial state setup
  updateThemeUI(getActiveTheme());

  const applyTheme = (theme) => {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    }
    updateThemeUI(theme);
  };

  lightBtn.addEventListener("click", () => applyTheme("light"));
  darkBtn.addEventListener("click", () => applyTheme("dark"));
}

document.addEventListener("DOMContentLoaded", () => {
  injectSiteChrome();
  markActiveLinks();
  setupMobileMenu();
  initThemeSwitcher();
});
