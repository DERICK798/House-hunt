const ADMIN_API_URL = "http://localhost:5000/api/admin";
const AUTH_API_URL = "http://localhost:5000/api/auth";

function setStatus(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let result = {};
  const rawText = await response.text();

  if (rawText) {
    try {
      result = JSON.parse(rawText);
    } catch (error) {
      result = { message: rawText };
    }
  }

  if (!response.ok) {
    throw new Error(result.message || `Request failed with status ${response.status}.`);
  }

  return result;
}

function getPageName() {
  const path = window.location.pathname.toLowerCase();
  if (path.endsWith("dashboard.html")) return "dashboard";
  return "login";
}

async function initLoginPage() {
  const form = document.getElementById("admin-login-form");
  const status = document.getElementById("admin-login-status");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("admin-email").value.trim().toLowerCase();
    const password = document.getElementById("admin-password").value;

    setStatus(status, "", false);
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Signing in...";

    try {
      const result = await apiRequest(`${ADMIN_API_URL}/login`, {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      setStatus(status, result.message || "Welcome back.", false);
      window.location.href = "dashboard.html";
    } catch (error) {
      setStatus(status, error.message || "Unable to sign in.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Sign in";
    }
  });
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  }).format(amount);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function getImageUrl(imagePath) {
  if (!imagePath) return "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1000&q=80";
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  return `http://localhost:5000${imagePath.startsWith("/") ? "" : "/"}${imagePath}`;
}

function toTitleCase(value) {
  return String(value || "").replace(/(^\w|\s\w)/g, (char) => char.toUpperCase());
}

async function loadSummary() {
  const summary = document.getElementById("summary-grid");
  if (!summary) return;

  try {
    const result = await apiRequest(`${ADMIN_API_URL}/summary`);
    const values = result.summary || {};
    const total = Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0);

    const cards = [
      { key: "pending", label: "Pending review", value: Number(values.pending || 0), tone: "warning" },
      { key: "approved", label: "Approved", value: Number(values.approved || 0), tone: "success" },
      { key: "rejected", label: "Rejected", value: Number(values.rejected || 0), tone: "danger" },
      { key: "total", label: "Total listings", value: total, tone: "neutral" }
    ];

    summary.innerHTML = cards.map((card) => `
      <article class="summary-card ${card.tone}">
        <span>${card.label}</span>
        <strong>${card.value}</strong>
      </article>
    `).join("");
  } catch (error) {
    summary.innerHTML = `<div class="empty-state"><strong>Summary unavailable</strong>${error.message}</div>`;
  }
}

async function loadProperties(status = "all") {
  const list = document.getElementById("admin-property-list");
  const notice = document.getElementById("admin-property-notice");
  if (!list) return;

  try {
    const query = new URLSearchParams();
    if (status !== "all") query.set("status", status);

    const result = await apiRequest(`${ADMIN_API_URL}/properties${query.toString() ? `?${query.toString()}` : ""}`);
    const properties = result.properties || [];

    if (!properties.length) {
      list.innerHTML = `
        <div class="empty-state">
          <strong>No properties in this queue</strong>
          There are no ${status === "all" ? "properties" : status} entries to review right now.
        </div>
      `;
      if (notice) setStatus(notice, "No properties match this filter.", false);
      return;
    }

    list.innerHTML = properties.map((property) => {
      const images = Array.isArray(property.images) && property.images.length ? property.images : [""];
      const primaryImage = escapeHtml(getImageUrl(images[0]));
      const statusText = toTitleCase(property.status || "pending");
      const canAction = !["approved", "rejected"].includes(String(property.status || "pending"));
      const propertyName = escapeHtml(property.property_name || "Untitled property");
      const location = escapeHtml([
        property.county || "County",
        property.town,
        property.estate
      ].filter(Boolean).join(", "));

      return `
        <article class="property-card">
          <div class="property-media">
            <img src="${primaryImage}" alt="${propertyName}">
          </div>
          <div class="property-body">
            <div class="property-topline">
              <div>
                <h3>${propertyName}</h3>
                <p>${location}</p>
              </div>
              <span class="status status-${escapeHtml(property.status || "pending")}">${escapeHtml(statusText)}</span>
            </div>

            <div class="property-meta">
              <span>${escapeHtml(property.category || "Property")}</span>
              <span>${formatCurrency(property.price || 0)}</span>
              <span>${escapeHtml(property.landlord_name || "Landlord")}</span>
            </div>

            <p class="property-description">${escapeHtml(property.description || "No description provided.")}</p>

            <div class="property-footer">
              <div class="property-contacts">
                <span>${escapeHtml(property.landlord_email || "No landlord email")}</span>
              </div>
              <div class="property-actions">
                ${canAction ? `
                  <button class="action-btn approve" data-decision="approve" data-id="${escapeHtml(property.id)}">Approve</button>
                  <button class="action-btn reject" data-decision="reject" data-id="${escapeHtml(property.id)}">Reject</button>
                ` : `<span class="finalized">${statusText}</span>`}
              </div>
            </div>
          </div>
        </article>
      `;
    }).join("");

    const actionButtons = list.querySelectorAll("[data-decision]");
    actionButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const id = Number(button.dataset.id);
        const decision = button.dataset.decision;
        if (!id || !decision) return;

        button.disabled = true;
        button.textContent = decision === "approve" ? "Approving..." : "Rejecting...";

        try {
          await apiRequest(`${ADMIN_API_URL}/properties/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ decision })
          });

          if (notice) {
            setStatus(notice, `Property ${decision === "approve" ? "approved" : "rejected"} successfully.`, false);
          }

          await loadSummary();
          await loadProperties(getCurrentFilter());
        } catch (error) {
          if (notice) setStatus(notice, error.message || "Could not update this property.", true);
        }
      });
    });

  } catch (error) {
    list.innerHTML = `<div class="empty-state"><strong>Unable to load queue</strong>${error.message}</div>`;
    if (notice) setStatus(notice, error.message, true);
  }
}

function getCurrentFilter() {
  const activeButtons = document.querySelectorAll(".filter-button.active");
  if (activeButtons.length) {
    return activeButtons[0].dataset.filter || "all";
  }
  return "all";
}

async function initDashboardPage() {
  const userName = document.getElementById("admin-user-name");
  const filterButtons = document.querySelectorAll(".filter-button");
  const notice = document.getElementById("admin-property-notice");
  const signOut = document.getElementById("admin-signout");

  if (filterButtons.length) {
    filterButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        filterButtons.forEach((item) => item.classList.toggle("active", item === button));
        const filter = button.dataset.filter || "all";
        const params = new URLSearchParams(window.location.search);
        if (filter === "all") params.delete("status");
        else params.set("status", filter);
        const qs = params.toString();
        const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
        window.history.replaceState({}, "", url);
        await loadProperties(filter);
      });
    });
  }

  if (signOut) {
    signOut.addEventListener("click", async () => {
      try {
        await apiRequest(`${AUTH_API_URL}/logout`, { method: "POST" });
      } catch (error) {
        console.warn("Logout failed silently:", error.message);
      } finally {
        window.location.href = "index.html";
      }
    });
  }

  try {
    const result = await apiRequest(`${ADMIN_API_URL}/me`);
    const fullName = result.user?.full_name || "Administrator";
    if (userName) userName.textContent = fullName;
    setStatus(notice, "Reviewing all property submissions.", false);
    await loadSummary();

    const initialFilter = new URLSearchParams(window.location.search).get("status") || "all";
    const activeButton = document.querySelector(`.filter-button[data-filter="${initialFilter}"]`);
    if (activeButton) {
      filterButtons.forEach((button) => button.classList.toggle("active", button === activeButton));
    }

    await loadProperties(initialFilter || "all");
  } catch (error) {
    if (notice) setStatus(notice, error.message || "Your session has expired.", true);
    window.location.href = "index.html?expired=1";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = getPageName();

  if (page === "login") {
    initLoginPage();
  }

  if (page === "dashboard") {
    initDashboardPage();
  }
});
