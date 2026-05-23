(function () {
  const config = window.ZERO_GRAVITY_SUPABASE_CONFIG || {};
  const LOGIN_FILE = "login.html";
  const ACCESS_DENIED_FILE = "access-denied.html";
  const RETURN_TO_KEY = "zeroGravityReturnTo";
  let client = null;
  let currentUser = null;
  let currentProfile = null;
  let isBlockedUser = false;
  let isBlockedRedirectInFlight = false;
  let resolveAuthReady = () => {};
  let authReady = false;
  const authReadyPromise = new Promise((resolve) => {
    resolveAuthReady = resolve;
  });

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizePathname(pathname) {
    const cleaned = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const file = cleaned.split("/").filter(Boolean).pop();
    return file || "index.html";
  }

  function getCurrentFile() {
    return normalizePathname(window.location.pathname);
  }

  function isLoginPage() {
    return getCurrentFile() === LOGIN_FILE;
  }

  function isAccessDeniedPage() {
    return getCurrentFile() === ACCESS_DENIED_FILE;
  }

  function isProtectedPage() {
    return !isLoginPage() && !isAccessDeniedPage();
  }

  function markAuthReady() {
    if (authReady) {
      return;
    }

    authReady = true;
    resolveAuthReady();
  }

  function isConfigured() {
    return Boolean(
      config.url &&
        config.anonKey &&
        window.supabase &&
        typeof window.supabase.createClient === "function"
    );
  }

  function canUseBrowserOAuth() {
    return window.location.protocol === "http:" || window.location.protocol === "https:";
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getSessionStore() {
    try {
      return window.sessionStorage;
    } catch (error) {
      console.warn("Zero Gravity session storage is not available:", error);
      return null;
    }
  }

  function createAuthClient() {
    const storage = getSessionStore();
    const authOptions = {
      persistSession: Boolean(storage),
      autoRefreshToken: true,
      detectSessionInUrl: true,
    };

    if (storage) {
      authOptions.storage = storage;
    }

    return window.supabase.createClient(config.url, config.anonKey, {
      auth: authOptions,
    });
  }

  function hasCachedSession() {
    if (!isConfigured()) {
      return false;
    }

    const storage = getSessionStore();

    if (!storage) {
      return false;
    }

    try {
      const projectRef = new URL(config.url).hostname.split(".")[0];
      const key = `sb-${projectRef}-auth-token`;
      const value = storage.getItem(key);

      if (!value) {
        return false;
      }

      const parsed = JSON.parse(value);
      const session = parsed.currentSession || parsed;

      return Boolean(
        session?.access_token &&
          (!session.expires_at || session.expires_at * 1000 > Date.now())
      );
    } catch (error) {
      console.warn("Zero Gravity session cache check skipped:", error);
      return false;
    }
  }

  function getDisplayName(user = currentUser) {
    if (!user) {
      return "";
    }

    const metadata = user.user_metadata || {};

    return (
      metadata.full_name ||
      metadata.name ||
      metadata.user_name ||
      (user.email ? user.email.split("@")[0] : "") ||
      "Friend"
    );
  }

  function getInitials(user = currentUser) {
    const name = getDisplayName(user).trim();

    if (!name) {
      return "ZG";
    }

    const parts = name.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "");
    return initials.join("") || name.slice(0, 2).toUpperCase();
  }

  function sanitizeReturnTo(value) {
    if (!value) {
      return "";
    }

    try {
      const url = new URL(value, window.location.origin);
      const targetFile = normalizePathname(url.pathname);

      if (url.origin !== window.location.origin || targetFile === LOGIN_FILE) {
        return "";
      }

      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return "";
    }
  }

  function getRequestedPath() {
    const searchParams = new URLSearchParams(window.location.search);
    const fromQuery = sanitizeReturnTo(searchParams.get("returnTo"));
    const fromStorage = sanitizeReturnTo(getSessionStore()?.getItem(RETURN_TO_KEY));
    return fromQuery || fromStorage || "./index.html";
  }

  function rememberReturnTo(value) {
    const safeValue = sanitizeReturnTo(value);

    if (!safeValue) {
      return;
    }

    getSessionStore()?.setItem(RETURN_TO_KEY, safeValue);
  }

  function clearReturnTo() {
    getSessionStore()?.removeItem(RETURN_TO_KEY);
  }

  function getLoginUrl(returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    const loginUrl = new URL(`./${LOGIN_FILE}`, window.location.href);
    const safeReturnTo = sanitizeReturnTo(returnTo);

    if (safeReturnTo) {
      loginUrl.searchParams.set("returnTo", safeReturnTo);
    }

    return loginUrl.toString();
  }

  function getAccessDeniedUrl() {
    return new URL(`./${ACCESS_DENIED_FILE}`, window.location.href).toString();
  }

  function getOAuthRedirectUrl() {
    const loginUrl = new URL(`./${LOGIN_FILE}`, window.location.href);
    const targetPath = getRequestedPath();

    if (targetPath) {
      loginUrl.searchParams.set("returnTo", targetPath);
    }

    return loginUrl.toString();
  }

  function updateLoginStatus(message) {
    document.querySelectorAll("[data-auth-login-status]").forEach((node) => {
      node.textContent = message;
    });
  }

  function releasePageLock() {
    document.body?.classList.remove("auth-checking");
    document.body?.classList.remove("auth-locked");
  }

  function redirectToLogin(returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    rememberReturnTo(returnTo);
    window.location.replace(getLoginUrl(returnTo));
  }

  function redirectToAccessDenied() {
    clearReturnTo();

    if (isAccessDeniedPage()) {
      releasePageLock();
      return;
    }

    window.location.replace(getAccessDeniedUrl());
  }

  function redirectToRequestedPage() {
    const targetPath = getRequestedPath();
    clearReturnTo();
    window.location.replace(targetPath || "./index.html");
  }

  function announceAuthChange() {
    window.dispatchEvent(
      new CustomEvent("zero-gravity-auth-changed", {
        detail: {
          user: currentUser,
          displayName: getDisplayName(currentUser),
        },
      })
    );
  }

  async function upsertProfile(user) {
    if (!client || !user) {
      return;
    }

    const payload = {
      id: user.id,
      email: normalizeEmail(user.email) || null,
      full_name: getDisplayName(user),
      avatar_url: user.user_metadata?.avatar_url || null,
      last_seen_at: new Date().toISOString(),
    };

    const { error } = await client
      .from(config.profilesTable || "zg_profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      console.warn("Zero Gravity profile sync skipped:", error.message);
    }
  }

  async function loadProfile(user) {
    if (!client || !user) {
      return null;
    }

    const profilesTable = config.profilesTable || "zg_profiles";

    const {
      data: ownProfile,
      error: ownProfileError,
    } = await client
      .from(profilesTable)
      .select("id, email, is_blocked")
      .eq("id", user.id)
      .maybeSingle();

    if (ownProfileError) {
      console.warn("Zero Gravity profile lookup failed:", ownProfileError.message);
    }

    if (ownProfile) {
      return ownProfile;
    }

    const email = normalizeEmail(user.email);

    if (!email) {
      return null;
    }

    const {
      data: emailMatches,
      error: emailLookupError,
    } = await client
      .from(profilesTable)
      .select("id, email, is_blocked")
      .ilike("email", email)
      .limit(1);

    if (emailLookupError) {
      console.warn("Zero Gravity email lookup failed:", emailLookupError.message);
      return null;
    }

    return emailMatches?.[0] || null;
  }

  async function handleBlockedUser() {
    if (isBlockedRedirectInFlight) {
      return;
    }

    isBlockedRedirectInFlight = true;
    isBlockedUser = true;
    currentUser = null;
    currentProfile = null;
    updateLoginStatus("This Google account does not have access to Zero Gravity.");
    renderAuth();
    announceAuthChange();
    markAuthReady();

    if (client) {
      const { error } = await client.auth.signOut();

      if (error) {
        console.warn("Zero Gravity blocked-user sign-out failed:", error.message);
      }
    }

    redirectToAccessDenied();
  }

  async function syncProfileAndCheckAccess(user) {
    currentProfile = await loadProfile(user);
    isBlockedUser = Boolean(currentProfile?.is_blocked);

    if (isBlockedUser) {
      await handleBlockedUser();
      return false;
    }

    await upsertProfile(user);
    currentProfile = currentProfile || {
      id: user.id,
      email: normalizeEmail(user.email) || null,
      is_blocked: false,
    };

    return true;
  }

  function renderAuthSlot(slot) {
    if (!slot) {
      return;
    }

    if (!currentUser) {
      slot.innerHTML = "";
      return;
    }

    const displayName = escapeHtml(getDisplayName(currentUser));
    const initials = escapeHtml(getInitials(currentUser));
    const email = currentUser.email
      ? `<span>${escapeHtml(currentUser.email)}</span>`
      : "<span>Signed in with Google</span>";

    slot.innerHTML = `
      <details class="auth-user-menu">
        <summary class="auth-user-trigger">
          <span class="auth-avatar">${initials}</span>
          <span class="auth-user-name">${displayName}</span>
        </summary>
        <div class="auth-user-panel">
          <div class="auth-user-meta">
            <strong>${displayName}</strong>
            ${email}
          </div>
          <button class="auth-signout" type="button" data-auth-action="signout">Sign out</button>
        </div>
      </details>
    `;
  }

  function renderAuthSummary(container) {
    if (!container) {
      return;
    }

    if (currentUser) {
      container.innerHTML = `
        <div class="auth-summary-card">
          <div class="auth-summary-main">
            <span class="auth-avatar auth-avatar-large">${escapeHtml(getInitials(currentUser))}</span>
            <div>
              <p class="auth-summary-title">Signed in as ${escapeHtml(getDisplayName(currentUser))}</p>
              <p class="auth-summary-copy">Your details are ready and linked to your profile.</p>
            </div>
          </div>
          <button class="auth-signout" type="button" data-auth-action="signout">Sign out</button>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
  }

  function updateAuthGreeting() {
    const name = getDisplayName(currentUser);

    document.querySelectorAll("[data-auth-greeting]").forEach((node) => {
      if (name) {
        node.textContent = `Welcome back, ${name}.`;
        node.hidden = false;
      } else {
        node.hidden = true;
      }
    });

    document.querySelectorAll("[data-auth-user-name]").forEach((node) => {
      node.textContent = name;
    });
  }

  function renderLoginPage() {
    if (!isLoginPage()) {
      return;
    }

    const loginButton = document.querySelector("[data-auth-login-button]");

    if (!isConfigured()) {
      if (loginButton) {
        loginButton.disabled = true;
      }
      updateLoginStatus("Google sign-in is not available until Supabase is configured correctly.");
      return;
    }

    if (currentUser) {
      if (loginButton) {
        loginButton.disabled = true;
      }
      updateLoginStatus(`Signed in as ${getDisplayName(currentUser)}. Taking you into Zero Gravity now...`);
      return;
    }

    if (loginButton) {
      loginButton.disabled = false;
    }
    updateLoginStatus("Sign in with Google to access projects, the problem hub, and the join form.");
  }

  async function handleSignIn() {
    if (!client) {
      updateLoginStatus("Google sign-in is not available yet. Please finish the Supabase setup first.");
      return;
    }

    if (!canUseBrowserOAuth()) {
      window.alert(
        "Open the site through http://localhost:8000 or your live domain before using Google sign-in."
      );
      return;
    }

    rememberReturnTo(getRequestedPath());
    updateLoginStatus("Redirecting you to Google sign-in...");

    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getOAuthRedirectUrl(),
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      console.warn("Zero Gravity sign-in failed:", error.message);
      updateLoginStatus("Google sign-in could not start. Please try again.");
    }
  }

  async function handleSignOut() {
    if (!client) {
      return;
    }

    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const { error } = await client.auth.signOut();

    if (error) {
      console.warn("Zero Gravity sign-out failed:", error.message);
      return;
    }

    redirectToLogin(currentPath);
  }

  function bindAuthButtons() {
    document.querySelectorAll("[data-auth-action='signin']").forEach((button) => {
      if (button.dataset.authBound === "true") {
        return;
      }

      button.dataset.authBound = "true";
      button.addEventListener("click", handleSignIn);
    });

    document.querySelectorAll("[data-auth-action='signout']").forEach((button) => {
      if (button.dataset.authBound === "true") {
        return;
      }

      button.dataset.authBound = "true";
      button.addEventListener("click", handleSignOut);
    });
  }

  function updateSignInButtons() {
    document.querySelectorAll(".nav-signin").forEach((button) => {
      button.style.display = currentUser ? "none" : "";
    });
    document.querySelectorAll(".mobile-nav-signin").forEach((button) => {
      button.style.display = currentUser ? "none" : "";
    });
  }

  function renderAuth() {
    renderAuthSlot(document.getElementById("nav-auth-desktop"));
    renderAuthSlot(document.getElementById("nav-auth-mobile"));
    document.querySelectorAll("[data-auth-summary]").forEach(renderAuthSummary);
    updateAuthGreeting();
    updateSignInButtons();
    renderLoginPage();
    bindAuthButtons();
  }

  function finalizeAuthState() {
    renderAuth();
    announceAuthChange();
    markAuthReady();

    if (isBlockedRedirectInFlight) {
      return;
    }

    if (isLoginPage() && currentUser) {
      redirectToRequestedPage();
      return;
    }

    if (isProtectedPage() && !currentUser) {
      redirectToLogin();
      return;
    }

    releasePageLock();
  }

  async function applySession(session) {
    currentUser = session?.user || null;
    currentProfile = null;
    isBlockedUser = false;

    if (currentUser) {
      const hasAccess = await syncProfileAndCheckAccess(currentUser);

      if (!hasAccess) {
        return;
      }
    }

    finalizeAuthState();
  }

  async function initAuth() {
    if (isProtectedPage() && !hasCachedSession()) {
      document.body?.classList.add("auth-checking");
    }

    renderAuth();

    if (!isConfigured()) {
      finalizeAuthState();
      return;
    }

    client = createAuthClient();

    const {
      data: { session },
      error,
    } = await client.auth.getSession();

    if (error) {
      console.warn("Zero Gravity session check failed:", error.message);
    }

    await applySession(session);

    client.auth.onAuthStateChange(async (_event, nextSession) => {
      await applySession(nextSession);
    });
  }

  window.ZeroGravityAuth = {
    getClient() {
      if (!client || !currentUser || isBlockedUser || isBlockedRedirectInFlight) {
        return null;
      }

      return client;
    },
    getUser() {
      return currentUser;
    },
    getProfile() {
      return currentProfile;
    },
    getDisplayName,
    getInitials,
    isConfigured,
    isReady() {
      return authReady;
    },
    waitForReady() {
      return authReadyPromise;
    },
    signIn: handleSignIn,
  };

  document.addEventListener("DOMContentLoaded", initAuth);
})();
