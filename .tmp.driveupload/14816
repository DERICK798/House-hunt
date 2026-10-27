const apiUrl = "http://localhost:5000/api/properties";
const bookingApiUrl = "http://localhost:5000/api/bookings";
const authApiUrl = "http://localhost:5000/api/auth";
const apiOrigin = "http://localhost:5000";
const apiStatusUrl = "http://localhost:5000/api/health/db";
const form = document.getElementById("listing-form");
const fields = document.getElementById("listing-fields");
const list = document.getElementById("listing-list");
const count = document.getElementById("listing-count");
const notice = document.getElementById("storage-notice");
const bookingNotice = document.getElementById("booking-notice");
const bookingList = document.getElementById("booking-review-list");
const money = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 2 });
let listings = [];

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

function setNotice(message, isError = false) {
    notice.textContent = message;
    notice.classList.toggle("error", isError);
}

async function request(path = "", options = {}, baseUrl = apiUrl) {
    const apiStatus = await checkApiStatus();
    if (!apiStatus.ok) {
        throw new Error(apiStatus.message);
    }

    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            ...(options.headers || {})
        }
    });
    let result;
    try {
        result = await response.json();
    } catch (error) {
        throw new Error("The API returned an unreadable response.");
    }
    if (!response.ok) {
        if (response.status === 401) {
            window.location.replace("../Auth.html?role=landlord");
        }
        throw new Error(result.message || `Request failed with status ${response.status}.`);
    }
    return result;
}

function setBookingNotice(message, isError = false) {
    bookingNotice.textContent = message;
    bookingNotice.classList.toggle("error", isError);
}

function renderBookingRequests(bookings) {
    bookingList.replaceChildren();
    if (bookings.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "There are no booking requests for your properties.";
        bookingList.append(empty);
        return;
    }

    bookings.forEach((booking) => {
        const row = document.createElement("article");
        row.className = "booking-review-row";
        const details = document.createElement("div");
        details.className = "booking-review-details";
        const title = document.createElement("strong");
        title.textContent = `${booking.property_name} — ${booking.tenant_name}`;
        const contact = document.createElement("p");
        contact.textContent = [
            booking.tenant_email,
            booking.tenant_phone,
            `KSh ${money.format(Number(booking.price))} / month`,
            new Date(booking.booking_date).toLocaleString("en-KE"),
            `Status: ${booking.status}`
        ].filter(Boolean).join(" · ");
        details.append(title, contact);
        row.append(details);

        if (booking.status === "pending") {
            const actions = document.createElement("div");
            actions.className = "booking-review-actions";
            [["approve", "Approve", "booking-approve"], ["reject", "Reject", "booking-reject"]]
                .forEach(([decision, label, className]) => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = className;
                    button.textContent = label;
                    button.addEventListener("click", () => reviewBooking(booking.id, decision, button));
                    actions.append(button);
                });
            row.append(actions);
        }
        bookingList.append(row);
    });
}

async function loadBookingRequests() {
    try {
        const response = await request("/landlord", {}, bookingApiUrl);
        if (!Array.isArray(response.bookings)) {
            throw new Error("The API response did not include booking requests.");
        }
        renderBookingRequests(response.bookings);
        setBookingNotice("Booking requests are up to date.");
    } catch (error) {
        console.error("Could not load landlord booking requests.", error);
        setBookingNotice(error.message || "Could not load booking requests.", true);
    }
}

async function reviewBooking(bookingId, decision, button) {
    button.disabled = true;
    try {
        const response = await request(`/${bookingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision })
        }, bookingApiUrl);
        setBookingNotice(response.message);
        await loadBookingRequests();
        if (decision === "approve") {
            await loadListings();
        }
    } catch (error) {
        console.error("Could not review booking request.", error);
        setBookingNotice(error.message || "Could not review booking request.", true);
        button.disabled = false;
    }
}

function setFormPending(isPending) {
    const button = form.querySelector("button[type='submit']");
    button.disabled = isPending;
    button.textContent = isPending ? "Submitting..." : "Submit property";
}

function renderListings() {
    list.replaceChildren();
    count.textContent = String(listings.length);

    if (listings.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const title = document.createElement("strong");
        title.textContent = "No properties yet";
        const text = document.createElement("span");
        text.textContent = "Add your first property using the form.";
        empty.append(title, text);
        list.append(empty);
        return;
    }

    listings.forEach((property) => {
        const card = document.createElement("article");
        card.className = "listing-row";

        const content = document.createElement("div");
        content.className = "listing-content";
        if (property.images.length > 0) {
            const image = document.createElement("img");
            image.className = "listing-image";
            image.src = `${apiOrigin}${property.images[0]}`;
            image.alt = `Photo of ${property.property_name}`;
            content.append(image);
        }

        const details = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "listing-title";
        title.textContent = property.property_name;
        const location = document.createElement("p");
        location.className = "listing-location";
        location.textContent = [property.estate, property.town, property.county].filter(Boolean).join(", ") || "Location not provided";
        const amenities = property.amenities ? document.createElement("p") : null;
        if (amenities) {
            amenities.className = "listing-location";
            amenities.textContent = `Amenities: ${property.amenities}`;
        }
        const meta = document.createElement("div");
        meta.className = "listing-meta";
        const price = document.createElement("span");
        price.className = "listing-price";
        price.textContent = `KSh ${money.format(Number(property.price))} / month`;
        const category = document.createElement("span");
        category.textContent = property.category;
        const status = document.createElement("span");
        status.className = "listing-status";
        status.textContent = property.status;
        meta.append(price, category, status);
        details.append(title, location);
        if (amenities) details.append(amenities);
        details.append(meta);
        content.append(details);

        const remove = document.createElement("button");
        remove.className = "delete-button";
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove ${property.property_name}`);
        remove.addEventListener("click", async () => {
            if (!window.confirm(`Remove "${property.property_name}"?`)) return;
            remove.disabled = true;
            try {
                await request(`/${property.id}`, { method: "DELETE" });
                listings = listings.filter((item) => item.id !== property.id);
                renderListings();
                setNotice("Property removed.");
            } catch (error) {
                console.error("Could not remove property.", error);
                setNotice(error.message || "Could not remove this property.", true);
                remove.disabled = false;
            }
        });

        card.append(content, remove);
        list.append(card);
    });
}

async function loadListings() {
    fields.disabled = true;
    try {
        const response = await request("/mine");
        if (!Array.isArray(response.properties)) {
            throw new Error("The API response did not include a property list.");
        }
        listings = response.properties.map((property) => ({
            ...property,
            images: Array.isArray(property.images) ? property.images : []
        }));
        renderListings();
        setNotice("Your properties are connected to the backend.");
        fields.disabled = false;
    } catch (error) {
        console.error("Could not load landlord properties.", error);
        setNotice(error instanceof TypeError
            ? "Could not reach the API. Start the backend at http://localhost:5000 and reload."
            : error.message || "Could not load your properties.", true);
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const amenities = Array.from(form.querySelectorAll("input[name='amenities']:checked"))
        .map((input) => input.value)
        .join(", ");
    formData.delete("amenities");
    formData.append("amenities", amenities);
    const images = document.getElementById("images").files;
    if (images.length > 8) {
        setNotice("You can upload up to 8 images per property.", true);
        return;
    }

    setFormPending(true);
    try {
        const response = await request("", { method: "POST", body: formData });
        listings.unshift({ ...response.property, images: response.property.images || [] });
        renderListings();
        form.reset();
        setNotice(response.message || "Property submitted for review.");
    } catch (error) {
        console.error("Could not submit property.", error);
        setNotice(error instanceof TypeError
            ? "Could not reach the API. Start the backend at http://localhost:5000 and try again."
            : error.message || "Could not submit this property.", true);
    } finally {
        setFormPending(false);
    }
});

document.getElementById("logout-button").addEventListener("click", async () => {
    try {
        const response = await fetch(`${authApiUrl}/logout`, {
            method: "POST",
            credentials: "include"
        });
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.message || "Could not sign out.");
        }
        window.location.replace("../Home.html");
    } catch (error) {
        console.error("Could not sign out.", error);
        setNotice(error.message || "Could not sign out.", true);
    }
});

async function initializeDashboard() {
    fields.disabled = true;
    try {
        const response = await fetch(`${authApiUrl}/me`, { credentials: "include" });
        if (response.status === 401) {
            window.location.replace("../Auth.html?role=landlord");
            return;
        }
        const result = await response.json();
        if (!response.ok || !result.user) {
            throw new Error(result.message || "Could not verify the signed-in account.");
        }
        if (result.user.role !== "landlord") {
            window.location.replace("../Auth.html?role=landlord");
            return;
        }
        await Promise.all([loadListings(), loadBookingRequests()]);
    } catch (error) {
        console.error("Could not initialize the landlord dashboard.", error);
        setNotice(error.message || "Could not verify your session.", true);
        setBookingNotice("Sign in again to load booking requests.", true);
    }
}

initializeDashboard();
