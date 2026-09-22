/* =========================================================
   TIKVAH CHILD CARE CENTER - V4
   Billing plans: DAILY (per day attended), WEEKLY, MONTHLY
========================================================= */

"use strict";

const STORAGE_KEY = "tikvah_v3_data";

/* =========================================================
   STATE
========================================================= */

function defaultState() {
    return {
        children: [],
        payments: [],
        attendance: [],
        charges: [],
        settings: { dailyFee: 100, weeklyFee: 700, monthlyFee: 3000 }
    };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const base = defaultState();
            return {
                children: parsed.children || [],
                payments: parsed.payments || [],
                attendance: parsed.attendance || [],
                charges: parsed.charges || [],
                settings: Object.assign(base.settings, parsed.settings || {})
            };
        }
    } catch (err) {
        console.error("Could not load saved data:", err);
    }
    return defaultState();
}

/* Import data saved by the old version (tikvah_children etc.) */
function migrateOldData() {
    if (localStorage.getItem(STORAGE_KEY)) return;
    try {
        const children = JSON.parse(localStorage.getItem("tikvah_children") || "null");
        if (!children || !children.length) return;
        state.children = children;
        state.payments = JSON.parse(localStorage.getItem("tikvah_payments") || "[]");
        state.attendance = JSON.parse(localStorage.getItem("tikvah_attendance") || "[]");
        state.charges = JSON.parse(localStorage.getItem("tikvah_additional_charges") || "[]");
        saveState();
    } catch (err) {
        console.error("Migration failed:", err);
    }
}

let state = loadState();

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* =========================================================
   HELPERS
========================================================= */

function $(selector) {
    return document.querySelector(selector);
}

function escapeHTML(value) {
    return String(value == null ? "" : value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatKES(amount) {
    return "KSh " + Number(amount || 0).toLocaleString();
}

function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function todayKey() {
    return new Date().toISOString().substring(0, 10);
}

function todayDateInput() {
    const d = new Date();
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}

function photoHTML(child) {
    return child && child.photo ? '<img src="' + child.photo + '" alt="">' : "👶";
}

/* =========================================================
   BILLING PLANS
========================================================= */

function planOf(child) {
    return child.billingPlan || "daily";
}

function planLabel(child) {
    const plan = planOf(child);
    return plan === "weekly" ? "Weekly" : plan === "monthly" ? "Monthly" : "Daily";
}

function defaultRateFor(plan) {
    const s = state.settings;
    if (plan === "weekly") return s.weeklyFee;
    if (plan === "monthly") return s.monthlyFee;
    return s.dailyFee;
}

function rateOf(child) {
    if (child.planRate != null && child.planRate !== "" && !isNaN(Number(child.planRate))) {
        return Number(child.planRate);
    }
    return defaultRateFor(planOf(child));
}

function daysAttended(childId) {
    const keys = new Set(
        state.attendance
            .filter(r => r.childId === childId && r.type === "IN")
            .map(r => r.date.substring(0, 10))
    );
    return keys.size;
}

/* How many periods this child has been billed for */
function periodsBilled(child) {
    const plan = planOf(child);

    if (plan === "daily") {
        return daysAttended(child.id);
    }

    const start = new Date(child.billingStart || child.registeredAt || Date.now());
    const now = new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (plan === "weekly") {
        const diffDays = Math.floor((nowDay - startDay) / 86400000);
        return Math.max(1, Math.floor(diffDays / 7) + 1);
    }

    // monthly: every calendar month touched from the start month counts
    const months = (nowDay.getFullYear() - startDay.getFullYear()) * 12 +
        (nowDay.getMonth() - startDay.getMonth()) + 1;
    return Math.max(1, months);
}

function periodLabel(child) {
    const n = periodsBilled(child);
    const plan = planOf(child);
    if (plan === "weekly") return n + (n === 1 ? " week" : " weeks");
    if (plan === "monthly") return n + (n === 1 ? " month" : " months");
    return n + (n === 1 ? " day" : " days");
}

function childFee(childId) {
    const child = state.children.find(c => c.id === childId);
    if (!child) return 0;
    const base = periodsBilled(child) * rateOf(child);
    const extras = state.charges
        .filter(c => c.childId === childId)
        .reduce((sum, c) => sum + Number(c.amount), 0);
    return base + extras;
}

function childPaid(childId) {
    return state.payments
        .filter(p => p.childId === childId)
        .reduce((sum, p) => sum + Number(p.amount), 0);
}

function totalPending() {
    return state.children.reduce((total, child) => {
        return total + Math.max(0, childFee(child.id) - childPaid(child.id));
    }, 0);
}

/* =========================================================
   NAVIGATION
========================================================= */

const PAGE_TITLES = {
    dashboard: ["Dashboard", "Welcome to Tikvah Child Care Center"],
    children: ["Children", "Manage registered children"],
    profile: ["Child Profile", "Selected child information"],
    attendance: ["Attendance", "Manage child arrival and departure"],
    payments: ["Payments", "Manage fees and payment records"],
    reports: ["Reports", "Center activity and financial information"],
    settings: ["Settings", "Configure the center and manage data"]
};

function showPage(name) {
    document.querySelectorAll("[data-page-section]").forEach(section => {
        section.style.display =
            section.getAttribute("data-page-section") === name ? "" : "none";
    });

    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-page") === name);
    });

    const titles = PAGE_TITLES[name] || PAGE_TITLES.dashboard;
    $("#page-title").textContent = titles[0];
    $("#page-subtitle").textContent = titles[1];

    if (name === "profile") {
        document.querySelectorAll(".nav-item").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-page") === "children");
        });
    }

    window.scrollTo({ top: 0 });
}

document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.getAttribute("data-page")));
});

document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.getAttribute("data-goto")));
});

/* =========================================================
   MODAL
========================================================= */

let modalSaveHandler = null;

function openModal(title, bodyHTML, onSave, saveLabel) {
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = bodyHTML;
    $("#modal-save").textContent = saveLabel || "Save";
    modalSaveHandler = onSave;
    $("#modal-overlay").style.display = "flex";
    const firstInput = $("#modal-body input, #modal-body select");
    if (firstInput) firstInput.focus();
}

function closeModal() {
    $("#modal-overlay").style.display = "none";
    modalSaveHandler = null;
}

$("#modal-close").addEventListener("click", closeModal);
$("#modal-cancel").addEventListener("click", closeModal);
$("#modal-overlay").addEventListener("click", e => {
    if (e.target === $("#modal-overlay")) closeModal();
});

$("#modal-form").addEventListener("submit", e => {
    e.preventDefault();
    if (!modalSaveHandler) return;
    const data = readForm();
    const ok = modalSaveHandler(data);
    if (ok !== false) closeModal();
});

function readForm() {
    const data = {};
    $("#modal-body").querySelectorAll("[data-field]").forEach(f => {
        data[f.getAttribute("data-field")] = f.value.trim();
    });
    return data;
}

function fieldHTML(key, label, type, value, extra) {
    if (type === "select") {
        const options = (extra || [])
            .map(o => '<option value="' + escapeHTML(o.value || o) + '"' +
                (String(o.value || o) === String(value) ? " selected" : "") + ">" +
                escapeHTML(o.label || o) + "</option>")
            .join("");
        return '<label>' + escapeHTML(label) + '</label>' +
            '<select data-field="' + key + '">' + options + "</select>";
    }
    return '<label>' + escapeHTML(label) + '</label>' +
        '<input type="' + type + '" data-field="' + key + '" value="' +
        escapeHTML(value == null ? "" : value) + '"' + (extra || "") + ">";
}

/* =========================================================
   AUTH
========================================================= */

$("#login-form").addEventListener("submit", e => {
    e.preventDefault();
    if (!$("#login-username").value.trim() || !$("#login-password").value.trim()) {
        alert("Please enter your username and password.");
        return;
    }
    sessionStorage.setItem("tikvah_logged_in", "yes");
    enterApp();
});

function enterApp() {
    $("#login-page").style.display = "none";
    $("#app").style.display = "flex";
    renderAll();
    showPage("dashboard");
}

$("#logout-btn").addEventListener("click", () => {
    if (!confirm("Log out of the admin system?")) return;
    sessionStorage.removeItem("tikvah_logged_in");
    location.reload();
});

/* =========================================================
   CHILDREN
========================================================= */

let selectedChildId = null;

function childFormHTML(child) {
    child = child || {};
    const plan = child.billingPlan || "daily";
    const startVal = (child.billingStart || child.registeredAt || todayDateInput()).substring(0, 10);
    return (
        fieldHTML("name", "Child's Full Name", "text", child.name, " required") +
        fieldHTML("age", "Age (years)", "number", child.age, ' min="0" max="18" required') +
        fieldHTML("className", "Class", "select", child.className || "Daycare",
            ["Daycare", "Baby Class", "Middle Class", "Pre-Unit"]) +
        fieldHTML("billingPlan", "Billing Plan", "select", plan, [
            { value: "daily", label: "Daily (pay per day attended)" },
            { value: "weekly", label: "Weekly (fixed amount per week)" },
            { value: "monthly", label: "Monthly (fixed amount per month)" }
        ]) +
        fieldHTML("planRate", "Rate per Period (KSh)", "number",
            child.planRate != null ? child.planRate : defaultRateFor(plan),
            ' min="0" required') +
        '<p class="field-hint" id="plan-hint">Leave the rate as-is to use the default from Settings.</p>' +
        fieldHTML("billingStart", "Billing Starts", "date", startVal) +
        fieldHTML("parent", "Parent / Guardian Name", "text", child.parent, " required") +
        fieldHTML("phone", "Parent / Guardian Phone", "tel", child.phone, " required") +
        fieldHTML("allergies", "Allergies / Medical Info", "text", child.allergies || "None") +
        '<label>Photo (optional)</label>' +
        '<input type="file" id="child-photo-input" accept="image/*">' +
        '<p class="field-hint">You can pick a photo from your device.</p>'
    );
}

/* When the plan changes in the form, auto-fill the default rate */
function hookPlanRateAutoFill() {
    const planSel = $('[data-field="billingPlan"]');
    const rateInput = $('[data-field="planRate"]');
    const hint = $("#plan-hint");
    if (!planSel || !rateInput) return;
    planSel.addEventListener("change", () => {
        const def = defaultRateFor(planSel.value);
        rateInput.value = def;
        if (hint) {
            hint.textContent = "Default for this plan: " + formatKES(def) +
                " per " + (planSel.value === "daily" ? "day attended" : planSel.value === "weekly" ? "week" : "month") + ".";
        }
    });
}

function readPhotoInput() {
    return new Promise(resolve => {
        const input = $("#child-photo-input");
        if (!input || !input.files || !input.files[0]) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const max = 300;
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const canvas = document.createElement("canvas");
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.8));
            };
            img.onerror = () => resolve(null);
            img.src = reader.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(input.files[0]);
    });
}

function validateChild(data) {
    if (!data.name || !data.age || !data.parent || !data.phone) {
        alert("Please fill in all required fields.");
        return false;
    }
    if (data.planRate === "" || isNaN(Number(data.planRate)) || Number(data.planRate) < 0) {
        alert("Please enter a valid rate per period.");
        return false;
    }
    return true;
}

$("#add-child-btn").addEventListener("click", () => {
    openModal("Register New Child", childFormHTML(), null, "Register");
    hookPlanRateAutoFill();
    modalSaveHandler = null;
    $("#modal-form").onsubmit = async e => {
        e.preventDefault();
        const data = readForm();
        if (!validateChild(data)) return;
        const photo = await readPhotoInput();
        state.children.push({
            id: Date.now(),
            name: data.name,
            age: data.age,
            className: data.className,
            billingPlan: data.billingPlan,
            planRate: Number(data.planRate),
            billingStart: data.billingStart || todayDateInput(),
            registeredAt: new Date().toISOString(),
            parent: data.parent,
            phone: data.phone,
            allergies: data.allergies || "None",
            photo: photo || "",
            status: "OUT"
        });
        saveState();
        renderAll();
        closeModal();
        alert(data.name + " has been registered (" + planLabel(state.children[state.children.length - 1]) + " plan).");
    };
});

function editChild(id) {
    const child = state.children.find(c => c.id === id);
    if (!child) return;
    openModal("Edit Child", childFormHTML(child), null, "Save Changes");
    hookPlanRateAutoFill();
    modalSaveHandler = null;
    $("#modal-form").onsubmit = async e => {
        e.preventDefault();
        const data = readForm();
        if (!validateChild(data)) return;
        const photo = await readPhotoInput();
        child.name = data.name;
        child.age = data.age;
        child.className = data.className;
        child.billingPlan = data.billingPlan;
        child.planRate = Number(data.planRate);
        child.billingStart = data.billingStart || child.billingStart;
        child.parent = data.parent;
        child.phone = data.phone;
        child.allergies = data.allergies || "None";
        if (photo) child.photo = photo;
        saveState();
        renderAll();
        if (selectedChildId === id) renderProfile();
        closeModal();
    };
}

function deleteChild(id) {
    const child = state.children.find(c => c.id === id);
    if (!child) return;
    if (!confirm("Delete " + child.name + " and all their records?")) return;
    state.children = state.children.filter(c => c.id !== id);
    state.payments = state.payments.filter(p => p.childId !== id);
    state.attendance = state.attendance.filter(a => a.childId !== id);
    state.charges = state.charges.filter(c => c.childId !== id);
    saveState();
    renderAll();
    showPage("children");
}

function renderChildren() {
    const grid = $("#children-grid");
    if (!state.children.length) {
        grid.innerHTML = '<p class="empty-message">No children registered yet. Tap "+ Add Child" to start.</p>';
        return;
    }
    grid.innerHTML = state.children.map(child => `
        <article class="child-card" data-child-id="${child.id}">
            <div class="child-photo">${photoHTML(child)}</div>
            <div class="child-info">
                <h3>${escapeHTML(child.name)}</h3>
                <p>Age: ${escapeHTML(child.age)} &bull; ${escapeHTML(child.className || "")}</p>
                <span class="status ${child.status === "IN" ? "in" : "out"}">● ${child.status}</span>
            </div>
        </article>
    `).join("");
    grid.querySelectorAll(".child-card").forEach(card => {
        card.addEventListener("click", () => openChild(Number(card.getAttribute("data-child-id"))));
    });
}

/* =========================================================
   PROFILE PAGE
========================================================= */

function openChild(id) {
    selectedChildId = id;
    renderProfile();
    showPage("profile");
}

function renderProfile() {
    const child = state.children.find(c => c.id === selectedChildId);
    const box = $("#profile-content");
    if (!child) {
        box.innerHTML = '<p class="empty-message">Select a child from the Children page.</p>';
        return;
    }

    const fee = childFee(child.id);
    const paid = childPaid(child.id);
    const balance = fee - paid;
    const isIn = child.status === "IN";

    box.innerHTML = `
        <div class="profile-layout">
            <div class="profile-card">
                <div class="large-child-photo">${photoHTML(child)}</div>
                <h2>${escapeHTML(child.name)}</h2>
                <span class="status ${isIn ? "in" : "out"}">● Currently ${child.status}</span>
                <div class="profile-actions">
                    <button class="toggle-btn ${isIn ? "check-out" : "check-in"}" id="profile-toggle">
                        ${isIn ? "→ Check OUT" : "✓ Check IN"}
                    </button>
                    <button class="secondary-btn" id="profile-pay">💳 Record Payment</button>
                    <button class="secondary-btn" id="profile-charge">➕ Add Extra Charge</button>
                    <button class="secondary-btn" id="profile-edit">✏️ Edit Details</button>
                    <button class="danger-btn" id="profile-delete">🗑️ Delete Child</button>
                </div>
            </div>
            <div>
                <div class="details-card">
                    <h3>Child Information</h3>
                    <div class="details-grid">
                        <div><label>Full Name</label><p>${escapeHTML(child.name)}</p></div>
                        <div><label>Age</label><p>${escapeHTML(child.age)} Years</p></div>
                        <div><label>Class</label><p>${escapeHTML(child.className || "-")}</p></div>
                        <div><label>Parent / Guardian</label><p>${escapeHTML(child.parent)}</p></div>
                        <div><label>Phone</label><p>${escapeHTML(child.phone)}</p></div>
                        <div><label>Allergies</label><p>${escapeHTML(child.allergies || "None")}</p></div>
                        <div><label>Billing Plan</label><p>${planLabel(child)} &bull; ${formatKES(rateOf(child))} per ${planOf(child) === "daily" ? "day" : planOf(child) === "weekly" ? "week" : "month"}</p></div>
                        <div><label>Billing Since</label><p>${formatDate(child.billingStart || child.registeredAt || Date.now())}</p></div>
                    </div>
                    <div class="fee-summary">
                        <div><span>Periods Billed</span><strong>${periodLabel(child)}</strong></div>
                        <div><span>Total Billed</span><strong>${formatKES(fee)}</strong></div>
                        <div><span>Total Paid</span><strong>${formatKES(paid)}</strong></div>
                        <div><span>Balance</span><strong class="${balance > 0 ? "" : "negative"}">${formatKES(Math.max(0, balance))}${balance < 0 ? " (overpaid)" : ""}</strong></div>
                    </div>
                </div>
                <div class="details-card" style="margin-top:15px">
                    <h3>Payment History</h3>
                    <div id="profile-history"></div>
                </div>
            </div>
        </div>
    `;

    $("#profile-toggle").addEventListener("click", () => toggleAttendance(child.id));
    $("#profile-pay").addEventListener("click", () => recordPayment(child.id));
    $("#profile-charge").addEventListener("click", () => addCharge(child.id));
    $("#profile-edit").addEventListener("click", () => editChild(child.id));
    $("#profile-delete").addEventListener("click", () => deleteChild(child.id));

    renderHistory(child.id);
}

function renderHistory(childId) {
    const box = $("#profile-history");
    if (!box) return;
    const events = [
        ...state.payments
            .filter(p => p.childId === childId)
            .map(p => ({ date: p.date, text: "Payment of " + formatKES(p.amount) + (p.method ? " (" + p.method + ")" : "") })),
        ...state.charges
            .filter(c => c.childId === childId)
            .map(c => ({ date: c.date, text: "Extra charge: " + c.description + " (" + formatKES(c.amount) + ")" }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!events.length) {
        box.innerHTML = '<p class="empty-message">No payments or charges yet.</p>';
        return;
    }
    box.innerHTML = '<div class="activity-list">' + events.map(ev => `
        <div class="activity-row">
            <span>${escapeHTML(ev.text)}</span>
            <span class="log-time">${formatDate(ev.date)} ${formatTime(ev.date)}</span>
        </div>
    `).join("") + "</div>";
}

$("#back-to-children").addEventListener("click", () => showPage("children"));

/* =========================================================
   ATTENDANCE
========================================================= */

function toggleAttendance(id) {
    const child = state.children.find(c => c.id === id);
    if (!child) return;

    const now = new Date().toISOString();
    if (child.status === "IN") {
        child.status = "OUT";
        state.attendance.push({ childId: id, childName: child.name, type: "OUT", date: now });
    } else {
        child.status = "IN";
        state.attendance.push({ childId: id, childName: child.name, type: "IN", date: now });
    }

    saveState();
    renderAll();
    if (selectedChildId === id && $('[data-page-section="profile"]').style.display !== "none") {
        renderProfile();
    }
}

function renderAttendanceList() {
    const box = $("#attendance-list");
    if (!state.children.length) {
        box.innerHTML = '<p class="empty-message">No children registered yet.</p>';
        return;
    }
    box.innerHTML = state.children.map(child => {
        const isIn = child.status === "IN";
        return `
        <div class="attendance-row">
            <div class="attendance-child">
                <div class="child-photo">${photoHTML(child)}</div>
                <div>
                    <h3>${escapeHTML(child.name)}</h3>
                    <p>${escapeHTML(child.className || "")} &bull; ${escapeHTML(child.age)} years</p>
                </div>
            </div>
            <button class="toggle-btn ${isIn ? "check-out" : "check-in"}" data-toggle-id="${child.id}">
                ${isIn ? "→ Check OUT" : "✓ Check IN"}
            </button>
        </div>`;
    }).join("");

    box.querySelectorAll("[data-toggle-id]").forEach(btn => {
        btn.addEventListener("click", () => toggleAttendance(Number(btn.getAttribute("data-toggle-id"))));
    });
}

function todaysRecords() {
    return state.attendance
        .filter(r => r.date.substring(0, 10) === todayKey())
        .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderActivityLog(container, records, emptyText) {
    if (!records.length) {
        container.innerHTML = '<p class="empty-message">' + escapeHTML(emptyText) + '</p>';
        return;
    }
    container.innerHTML = '<div class="activity-list">' + records.map(r => `
        <div class="activity-row">
            <span class="log-name">${escapeHTML(r.childName || "")}</span>
            <span class="log-badge ${r.type === "IN" ? "in" : "out"}">${r.type === "IN" ? "✓ IN" : "→ OUT"}</span>
            <span class="log-time">${formatTime(r.date)}</span>
        </div>
    `).join("") + "</div>";
}

/* =========================================================
   PAYMENTS
========================================================= */

function recordPayment(childId) {
    const child = state.children.find(c => c.id === childId);
    if (!child) return;
    const balance = Math.max(0, childFee(childId) - childPaid(childId));

    openModal("Record Payment - " + child.name,
        fieldHTML("amount", "Amount (KSh)", "number", balance || "", ' min="1" required') +
        fieldHTML("method", "Method", "select", "Cash", ["Cash", "M-Pesa", "Bank", "Other"]),
        data => {
            const amount = Number(data.amount);
            if (!amount || amount <= 0 || isNaN(amount)) {
                alert("Please enter a valid amount.");
                return false;
            }
            state.payments.push({
                id: Date.now(),
                childId: childId,
                childName: child.name,
                amount: amount,
                method: data.method,
                date: new Date().toISOString()
            });
            saveState();
            renderAll();
            if (selectedChildId === childId) renderProfile();
            alert("Payment of " + formatKES(amount) + " recorded for " + child.name + ".");
        }, "Record Payment");
}

function addCharge(childId) {
    const child = state.children.find(c => c.id === childId);
    if (!child) return;

    openModal("Add Extra Charge - " + child.name,
        fieldHTML("description", "Description (e.g. Transport, Meals)", "text", "", " required") +
        fieldHTML("amount", "Amount (KSh)", "number", "", ' min="1" required'),
        data => {
            const amount = Number(data.amount);
            if (!data.description || !amount || amount <= 0 || isNaN(amount)) {
                alert("Please enter a valid description and amount.");
                return false;
            }
            state.charges.push({
                id: Date.now(),
                childId: childId,
                description: data.description,
                amount: amount,
                date: new Date().toISOString()
            });
            saveState();
            renderAll();
            if (selectedChildId === childId) renderProfile();
        }, "Add Charge");
}

function renderPaymentsPage() {
    const s = state.settings;
    const label = $("#fee-summary-label");
    if (label) {
        label.textContent = "Daily " + formatKES(s.dailyFee) + "/day • Weekly " +
            formatKES(s.weeklyFee) + " • Monthly " + formatKES(s.monthlyFee);
    }

    const billed = state.children.reduce((sum, c) => sum + childFee(c.id), 0);
    const collected = state.payments.reduce((sum, p) => sum + Number(p.amount), 0);

    $("#pay-billed").textContent = formatKES(billed);
    $("#pay-collected").textContent = formatKES(collected);
    $("#pay-pending").textContent = formatKES(Math.max(0, billed - collected));

    const tbody = $("#payments-table tbody");
    if (!state.children.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-message">No children registered yet.</td></tr>';
        return;
    }

    tbody.innerHTML = state.children.map(child => {
        const fee = childFee(child.id);
        const paid = childPaid(child.id);
        const balance = fee - paid;
        return `
        <tr>
            <td><strong>${escapeHTML(child.name)}</strong><br><small style="color:#888">${planLabel(child)} &bull; ${formatKES(rateOf(child))}</small></td>
            <td>${periodLabel(child)}</td>
            <td>${formatKES(fee)}</td>
            <td>${formatKES(paid)}</td>
            <td class="${balance > 0 ? "balance-due" : "balance-ok"}">${balance > 0 ? formatKES(balance) : "✓ Clear"}</td>
            <td>
                <div class="row-actions">
                    <button class="mini-btn green" data-pay-id="${child.id}">💳 Pay</button>
                    <button class="mini-btn" data-charge-id="${child.id}">➕ Charge</button>
                    <button class="mini-btn" data-history-id="${child.id}">📄 History</button>
                </div>
            </td>
        </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-pay-id]").forEach(b =>
        b.addEventListener("click", () => recordPayment(Number(b.getAttribute("data-pay-id")))));
    tbody.querySelectorAll("[data-charge-id]").forEach(b =>
        b.addEventListener("click", () => addCharge(Number(b.getAttribute("data-charge-id")))));
    tbody.querySelectorAll("[data-history-id]").forEach(b =>
        b.addEventListener("click", () => openChild(Number(b.getAttribute("data-history-id")))));
}

/* =========================================================
   REPORTS
========================================================= */

document.querySelectorAll("[data-report]").forEach(card => {
    card.addEventListener("click", () => generateReport(card.getAttribute("data-report")));
});

function generateReport(type) {
    const out = $("#report-output");
    const now = new Date();
    let title = "", subtitle = "", body = "";

    if (type === "attendance") {
        title = "Attendance Report";
        subtitle = "Generated " + now.toLocaleString();
        const records = [...state.attendance]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 200);
        const ins = state.children.filter(c => c.status === "IN").length;

        body = "<h4>Summary</h4>" +
            "<p>Children currently IN: <strong>" + ins + "</strong> &nbsp; OUT: <strong>" +
            (state.children.length - ins) + "</strong></p>" +
            "<h4>Recent Records (newest first)</h4>" +
            (records.length ? tableHTML(
                ["Date", "Time", "Child", "Type"],
                records.map(r => [formatDate(r.date), formatTime(r.date), r.childName || "", r.type])
            ) : "<p>No attendance records yet.</p>");
    }

    if (type === "payments") {
        title = "Payment Report";
        subtitle = "Generated " + now.toLocaleString();
        const payments = [...state.payments].sort((a, b) => new Date(b.date) - new Date(a.date));
        const total = payments.reduce((s, p) => s + Number(p.amount), 0);
        const pending = totalPending();

        body = "<h4>Summary</h4>" +
            "<p>Total collected: <strong>" + formatKES(total) + "</strong> &nbsp; " +
            "Total pending: <strong>" + formatKES(pending) + "</strong></p>" +
            "<h4>Payments (newest first)</h4>" +
            (payments.length ? tableHTML(
                ["Date", "Child", "Amount", "Method"],
                payments.map(p => [formatDate(p.date), p.childName || "", formatKES(p.amount), p.method || "-"])
            ) : "<p>No payments recorded yet.</p>");
    }

    if (type === "children") {
        title = "Children Report";
        subtitle = "Generated " + now.toLocaleString() + " • " +
            state.children.length + " children registered";
        body = state.children.length ? tableHTML(
            ["Name", "Age", "Class", "Plan", "Parent / Guardian", "Phone", "Allergies", "Status"],
            state.children.map(c => [
                c.name, String(c.age), c.className || "-",
                planLabel(c) + " (" + formatKES(rateOf(c)) + ")",
                c.parent || "-", c.phone || "-", c.allergies || "None", c.status
            ])
        ) : "<p>No children registered yet.</p>";
    }

    $("#report-title").textContent = title;
    $("#report-subtitle").innerHTML = subtitle;
    out.innerHTML = body;
    $("#report-section").style.display = "";
    $("#report-section").scrollIntoView({ behavior: "smooth" });
}

function tableHTML(headers, rows) {
    return "<div class='table-wrap'><table><thead><tr>" +
        headers.map(h => "<th>" + escapeHTML(h) + "</th>").join("") +
        "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + r.map(c => "<td>" + escapeHTML(c) + "</td>").join("") + "</tr>").join("") +
        "</tbody></table></div>";
}

$("#print-report-btn").addEventListener("click", () => window.print());

/* =========================================================
   SETTINGS
========================================================= */

function renderSettings() {
    $("#daily-fee-input").value = state.settings.dailyFee;
    $("#weekly-fee-input").value = state.settings.weeklyFee;
    $("#monthly-fee-input").value = state.settings.monthlyFee;
}

$("#save-fee-btn").addEventListener("click", () => {
    const daily = Number($("#daily-fee-input").value);
    const weekly = Number($("#weekly-fee-input").value);
    const monthly = Number($("#monthly-fee-input").value);
    if ([daily, weekly, monthly].some(v => isNaN(v) || v < 0)) {
        alert("Please enter valid amounts (0 or more).");
        return;
    }
    state.settings.dailyFee = daily;
    state.settings.weeklyFee = weekly;
    state.settings.monthlyFee = monthly;
    saveState();
    renderAll();
    alert("Default fees updated.");
});

$("#export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tikvah-backup-" + todayKey() + ".json";
    a.click();
    URL.revokeObjectURL(url);
});

$("#import-input").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!Array.isArray(data.children)) throw new Error("bad file");
            if (!confirm("Restore this backup? Current data will be replaced.")) return;
            state = Object.assign(defaultState(), data);
            saveState();
            renderAll();
            alert("Backup restored successfully.");
        } catch (err) {
            alert("That file could not be read. Please use a Tikvah backup file.");
        }
    };
    reader.readAsText(file);
    e.target.value = "";
});

$("#clear-data-btn").addEventListener("click", () => {
    if (!confirm("This will permanently delete ALL data. Continue?")) return;
    if (!confirm("Are you absolutely sure? This cannot be undone!")) return;
    state = defaultState();
    saveState();
    renderAll();
    alert("All data has been cleared.");
});

/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {
    $("#stat-total").textContent = state.children.length;
    $("#stat-in").textContent = state.children.filter(c => c.status === "IN").length;
    $("#stat-out").textContent = state.children.filter(c => c.status === "OUT").length;
    $("#stat-pending").textContent = formatKES(totalPending());
    renderActivityLog($("#dashboard-today"), todaysRecords(), "No activity recorded today yet.");
}

/* =========================================================
   MASTER RENDER
========================================================= */

function renderAll() {
    renderChildren();
    renderDashboard();
    renderAttendanceList();
    renderActivityLog($("#attendance-log"), todaysRecords(), "No movements recorded today.");
    renderPaymentsPage();
    renderSettings();
}

/* =========================================================
   START
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    migrateOldData();
    $("#year").textContent = new Date().getFullYear();
    if (sessionStorage.getItem("tikvah_logged_in") === "yes") {
        enterApp();
    }
});
