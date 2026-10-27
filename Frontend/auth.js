const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const loginPanel = document.getElementById("login-panel");
const registerPanel = document.getElementById("register-panel");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authApiUrl = "http://localhost:5000/api/auth";
const apiStatusUrl = "http://localhost:5000/api/health/db";

async function checkApiStatus() {
    try {
        const response = await fetch(apiStatusUrl, {
            method: "GET",
            cache: "no-store",
            credentials: "include"
        });

        if (!response.ok) {
            return {
                ok: false,
                message: "The API is currently unavailable. Start the backend at http://localhost:5000 and try again."
            };
        }

        const result = await response.json().catch(() => ({}));
        return {
            ok: Boolean(result && result.message),
            message: result?.message || "API connection verified."
        };
    } catch (error) {
        return {
            ok: false,
            message: "Could not reach the API. Start the backend at http://localhost:5000 and try again."
        };
    }
}

try {
    sessionStorage.removeItem("haven-auth-token");
    sessionStorage.removeItem("haven-auth-user");
} catch (error) {
    console.error("Could not clear the legacy browser session.", error);
}

function showPanel(panelName, updateUrl) {
    const isLogin = panelName === "login";
    loginTab.setAttribute("aria-selected", String(isLogin));
    registerTab.setAttribute("aria-selected", String(!isLogin));
    loginTab.tabIndex = isLogin ? 0 : -1;
    registerTab.tabIndex = isLogin ? -1 : 0;
    loginPanel.hidden = !isLogin;
    registerPanel.hidden = isLogin;

    if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set("mode", panelName);
        window.history.replaceState({}, "", url);
    }
}

function setRoleFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    if (role === "tenant" || role === "landlord") {
        document.getElementById("login-role").value = role;
        document.getElementById("register-role").value = role;
    }

    showPanel(params.get("mode") === "register" ? "register" : "login", false);
}

loginTab.addEventListener("click", () => showPanel("login", true));
registerTab.addEventListener("click", () => showPanel("register", true));

[loginTab, registerTab].forEach((tab) => {
    tab.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            const nextTab = tab === loginTab ? registerTab : loginTab;
            nextTab.focus();
            nextTab.click();
        }
    });
});

async function sendAuthRequest(endpoint, data) {
    const apiStatus = await checkApiStatus();
    if (!apiStatus.ok) {
        throw new Error(apiStatus.message);
    }

    const response = await fetch(`${authApiUrl}/${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    let result;
    try {
        result = await response.json();
    } catch (error) {
        throw new Error("The API returned an unreadable response. Check the backend server logs.");
    }

    if (!result || typeof result !== "object") {
        throw new Error("The API returned an unexpected response. Check the backend server logs.");
    }

    if (!response.ok) {
        throw new Error(result.message || `Request failed with status ${response.status}.`);
    }

    return result;
}

function setStatus(elementId, message, isError) {
    const status = document.getElementById(elementId);
    status.textContent = message;
    status.classList.toggle("error", isError);
}

function reportRequestError(elementId, error) {
    if (error instanceof TypeError) {
        setStatus(elementId, "Could not reach the API. Start the backend at http://localhost:5000 and try again.", true);
        return;
    }
    setStatus(elementId, error.message || "The request failed. Please try again.", true);
}

function setFormPending(form, isPending, idleLabel) {
    const button = form.querySelector("button[type='submit']");
    button.disabled = isPending;
    button.textContent = isPending ? "Please wait..." : idleLabel;
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("login-status", "", false);
    setFormPending(loginForm, true, "Sign in");

    try {
        const response = await sendAuthRequest("login", {
            email: document.getElementById("login-email").value.trim().toLowerCase(),
            password: document.getElementById("login-password").value,
            role: document.getElementById("login-role").value
        });
        if (!response.user || !response.user.role) {
            throw new Error("The API response is missing the account role.");
        }

        const selectedRole = document.getElementById("login-role").value;
        if (response.user.role !== selectedRole) {
            setStatus("login-status", `This account is registered as a ${response.user.role}. Choose that role and sign in again.`, true);
            return;
        }

        setStatus("login-status", `Welcome, ${response.user.full_name}. You are signed in as a ${response.user.role}.`, false);
        window.location.href = response.user.role === "tenant"
            ? "Home.html"
            : "Landlord/index.html";
    } catch (error) {
        reportRequestError("login-status", error);
    } finally {
        setFormPending(loginForm, false, "Sign in");
    }
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("register-status", "", false);
    setFormPending(registerForm, true, "Create account");

    try {
        const email = document.getElementById("register-email").value.trim().toLowerCase();
        const role = document.getElementById("register-role").value;
        const response = await sendAuthRequest("register", {
            full_name: document.getElementById("register-name").value.trim(),
            email,
            phone: document.getElementById("register-phone").value.trim(),
            password: document.getElementById("register-password").value,
            role
        });

        registerForm.reset();
        document.getElementById("login-email").value = email;
        document.getElementById("login-role").value = role;
        document.getElementById("register-role").value = role;
        showPanel("login", true);
        setStatus("login-status", response.message || "Registration successful. You can now sign in.", false);
    } catch (error) {
        reportRequestError("register-status", error);
    } finally {
        setFormPending(registerForm, false, "Create account");
    }
});

setRoleFromUrl();
