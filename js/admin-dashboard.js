const DASHBOARD_API_BASE_URL = `${window.location.origin}/api`;

const state = {
  members: [],
  contactSubmissions: [],
  stats: {
    totalMembers: 0,
    recentMembers: 0,
    pendingMemberships: 0,
  },
};

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${DASHBOARD_API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  if (response.status === 401 || response.status === 403) {
    sessionStorage.removeItem("user");
    window.location.href = "admin.html";
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const errorData = await safeJson(response);
    throw new Error(errorData.error || "Request failed");
  }

  return safeJson(response);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}

async function getCurrentUser() {
  try {
    const response = await fetch(`${DASHBOARD_API_BASE_URL}/auth/me`, {
      credentials: "same-origin",
    });

    if (!response.ok) return null;

    const data = await response.json();
    sessionStorage.setItem("user", JSON.stringify(data.user));
    return data.user;
  } catch (error) {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.background = isError ? "#b42318" : "#102a43";
  toast.classList.add("show");

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function renderSummary() {
  document.getElementById("dashboard-welcome").textContent =
    "Här ser du alla registreringar och meddelanden samlade för den manuella klubbadministrationen.";

  const cards = [
    {
      label: "Totalt antal anmälningar",
      value: state.stats.totalMembers,
      sub: "Alla registrerade medlemmar",
    },
    {
      label: "Senaste 30 dagar",
      value: state.stats.recentMembers,
      sub: "Nya registreringar",
    },
    {
      label: "Kontaktmeddelanden",
      value: state.contactSubmissions.length,
      sub: "Från kontaktsidan",
    },
  ];

  document.getElementById("summary-cards").innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(String(card.value))}</strong>
          <p>${escapeHtml(card.sub)}</p>
        </article>
      `,
    )
    .join("");
}

function getFilteredMembers() {
  const query = document.getElementById("members-search").value.trim().toLowerCase();
  return state.members.filter((member) => {
    if (!query) return true;

    return [
      member.first_name,
      member.last_name,
      member.email,
      member.phone,
      member.personnummer,
      member.parent_name,
      member.parent_lastname,
      member.parent_phone,
      member.address,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function renderMembers() {
  const members = getFilteredMembers();

  document.getElementById("members-count").textContent = `${members.length} visade`;

  document.getElementById("members-table").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Anmäld</th>
          <th>Namn</th>
          <th>E-post</th>
          <th>Telefon</th>
          <th>Personnummer</th>
          <th>Adress</th>
          <th>Vårdnadshavare</th>
        </tr>
      </thead>
      <tbody>
        ${
          members.length
            ? members
                .map(
                  (member) => `
                    <tr>
                      <td>${escapeHtml(formatDate(member.created_at))}</td>
                      <td>${escapeHtml(`${member.first_name} ${member.last_name}`)}</td>
                      <td>${escapeHtml(member.email || "-")}</td>
                      <td>${escapeHtml(member.phone || "-")}</td>
                      <td>${escapeHtml(member.personnummer || "-")}</td>
                      <td>${escapeHtml(member.address || "-")}</td>
                      <td>${escapeHtml(
                        [member.parent_name, member.parent_lastname, member.parent_phone]
                          .filter(Boolean)
                          .join(" | ") || "-",
                      )}</td>
                    </tr>
                  `,
                )
                .join("")
            : `
              <tr>
                <td colspan="7" class="empty-state">Inga registreringar hittades.</td>
              </tr>
            `
        }
      </tbody>
    </table>
  `;

  document.getElementById("members-cards").innerHTML = members.length
    ? members
        .map(
          (member) => `
            <article class="member-card">
              <div>
                <h3>${escapeHtml(`${member.first_name} ${member.last_name}`)}</h3>
                <div class="member-meta">Anmäld ${escapeHtml(formatDate(member.created_at))}</div>
              </div>
              <div class="member-detail"><span>E-post</span><strong>${escapeHtml(member.email || "-")}</strong></div>
              <div class="member-detail"><span>Telefon</span><strong>${escapeHtml(member.phone || "-")}</strong></div>
              <div class="member-detail"><span>Personnummer</span><strong>${escapeHtml(member.personnummer || "-")}</strong></div>
              <div class="member-detail"><span>Adress</span><strong>${escapeHtml(member.address || "-")}</strong></div>
              <div class="member-detail"><span>Vårdnadshavare</span><strong>${escapeHtml(
                [member.parent_name, member.parent_lastname, member.parent_phone]
                  .filter(Boolean)
                  .join(" | ") || "-",
              )}</strong></div>
            </article>
          `,
        )
        .join("")
    : '<div class="empty-state">Inga registreringar hittades.</div>';
}

function getFilteredContactSubmissions() {
  const query = document.getElementById("contacts-search").value.trim().toLowerCase();
  return state.contactSubmissions.filter((submission) => {
    if (!query) return true;
    return [submission.name, submission.email, submission.message]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function renderContactSubmissions() {
  const submissions = getFilteredContactSubmissions();
  document.getElementById("contacts-count").textContent = `${submissions.length} visade`;

  document.getElementById("contacts-table").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Namn</th>
          <th>E-post</th>
          <th>Meddelande</th>
        </tr>
      </thead>
      <tbody>
        ${
          submissions.length
            ? submissions
                .map(
                  (submission) => `
                    <tr>
                      <td>${escapeHtml(formatDate(submission.created_at))}</td>
                      <td>${escapeHtml(submission.name)}</td>
                      <td>${escapeHtml(submission.email)}</td>
                      <td>${escapeHtml(submission.message)}</td>
                    </tr>
                  `,
                )
                .join("")
            : `
              <tr>
                <td colspan="4" class="empty-state">Inga kontaktmeddelanden hittades.</td>
              </tr>
            `
        }
      </tbody>
    </table>
  `;

  document.getElementById("contacts-cards").innerHTML = submissions.length
    ? submissions
        .map(
          (submission) => `
            <article class="member-card">
              <div>
                <h3>${escapeHtml(submission.name)}</h3>
                <div class="member-meta">${escapeHtml(formatDate(submission.created_at))}</div>
              </div>
              <div class="member-detail"><span>E-post</span><strong>${escapeHtml(submission.email)}</strong></div>
              <div class="member-detail"><span>Meddelande</span><strong>${escapeHtml(submission.message)}</strong></div>
            </article>
          `,
        )
        .join("")
    : '<div class="empty-state">Inga kontaktmeddelanden hittades.</div>';
}

function bindCollapseToggle(buttonId, panelId, closedLabel, openLabel) {
  const button = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);
  if (!button || !panel) return;

  const sync = () => {
    const isCollapsed = panel.classList.contains("is-collapsed");
    button.setAttribute("aria-expanded", String(!isCollapsed));
    button.textContent = isCollapsed ? closedLabel : openLabel;
  };

  button.addEventListener("click", () => {
    panel.classList.toggle("is-collapsed");
    sync();
  });

  sync();
}

function exportCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportMembers() {
  const stamp = new Date().toISOString().slice(0, 10);
  exportCsv(`nylose-medlemmar-${stamp}.csv`, [
    [
      "Anmäld",
      "Förnamn",
      "Efternamn",
      "E-post",
      "Telefon",
      "Personnummer",
      "Adress",
      "Vårdnadshavare förnamn",
      "Vårdnadshavare efternamn",
      "Vårdnadshavare telefon",
    ],
    ...getFilteredMembers().map((member) => [
      formatDate(member.created_at),
      member.first_name || "",
      member.last_name || "",
      member.email || "",
      member.phone || "",
      member.personnummer || "",
      member.address || "",
      member.parent_name || "",
      member.parent_lastname || "",
      member.parent_phone || "",
    ]),
  ]);
}

function exportContactSubmissions() {
  const stamp = new Date().toISOString().slice(0, 10);
  exportCsv(`nylose-kontaktmeddelanden-${stamp}.csv`, [
    ["Datum", "Namn", "E-post", "Meddelande"],
    ...getFilteredContactSubmissions().map((submission) => [
      formatDate(submission.created_at),
      submission.name || "",
      submission.email || "",
      submission.message || "",
    ]),
  ]);
}

async function refreshDashboard() {
  try {
    const [members, stats, contactSubmissions] = await Promise.all([
      apiFetch("/admin/members"),
      apiFetch("/admin/statistics"),
      apiFetch("/admin/contact-submissions"),
    ]);

    state.members = members;
    state.stats = stats;
    state.contactSubmissions = contactSubmissions;

    renderSummary();
    renderMembers();
    renderContactSubmissions();
  } catch (error) {
    showToast(error.message || "Kunde inte ladda adminpanelen", true);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    window.location.href = "admin.html";
    return;
  }

  document.getElementById("members-search").addEventListener("input", renderMembers);
  document
    .getElementById("contacts-search")
    .addEventListener("input", renderContactSubmissions);
  bindCollapseToggle(
    "toggle-members",
    "members-panel",
    "Visa registreringar",
    "Dölj registreringar",
  );
  bindCollapseToggle(
    "toggle-contacts",
    "contacts-panel",
    "Visa meddelanden",
    "Dölj meddelanden",
  );
  document.getElementById("export-dashboard").addEventListener("click", exportMembers);
  document
    .getElementById("export-contacts")
    .addEventListener("click", exportContactSubmissions);
  document.getElementById("refresh-dashboard").addEventListener("click", refreshDashboard);
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch(`${DASHBOARD_API_BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "same-origin",
    });
    sessionStorage.removeItem("user");
    window.location.href = "admin.html";
  });

  await refreshDashboard();
});
