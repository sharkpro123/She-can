const authForm = document.getElementById("admin-auth");
const adminKeyInput = document.getElementById("admin-key");
const adminStatus = document.getElementById("admin-status");
const adminPanel = document.getElementById("admin-panel");
const submissionsContainer = document.getElementById("submissions-container");
const refreshBtn = document.getElementById("refresh-btn");
const logoutBtn = document.getElementById("logout-btn");

const ADMIN_KEY_STORAGE = "she-can-admin-key";

function setStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.classList.toggle("error", isError);
}

function getAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
}

function setAdminKey(key) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

function clearAdminKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString();
}

function renderSubmissions(submissions) {
  if (!submissions.length) {
    submissionsContainer.innerHTML = '<p class="empty-state">No submissions yet.</p>';
    return;
  }

  const cards = submissions
    .map((item) => {
      return `
        <article class="submission-card" data-id="${item.id}">
          <header>
            <h2>${item.name}</h2>
            <p>${item.email}</p>
          </header>
          <p class="submission-date">${formatDate(item.submittedAt)}</p>
          <p class="submission-message">${item.message}</p>
          <button class="danger delete-btn" data-id="${item.id}" type="button">Delete</button>
        </article>
      `;
    })
    .join("");

  submissionsContainer.innerHTML = cards;
}

async function loadSubmissions() {
  const key = getAdminKey();

  if (!key) {
    adminPanel.classList.add("hidden");
    setStatus("Enter admin key to access submissions.");
    return;
  }

  setStatus("Loading submissions...");

  try {
    const response = await fetch("/api/admin/submissions", {
      headers: {
        "x-admin-key": key,
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Unable to load submissions.");
    }

    renderSubmissions(payload.submissions || []);
    adminPanel.classList.remove("hidden");
    setStatus(`Loaded ${(payload.submissions || []).length} submissions.`);
  } catch (error) {
    adminPanel.classList.add("hidden");
    setStatus(error.message || "Unable to load submissions.", true);
  }
}

async function deleteSubmission(id) {
  const key = getAdminKey();
  if (!key) {
    setStatus("Session expired. Please unlock again.", true);
    return;
  }

  setStatus("Deleting submission...");

  try {
    const response = await fetch(`/api/admin/submissions/${id}`, {
      method: "DELETE",
      headers: {
        "x-admin-key": key,
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Unable to delete submission.");
    }

    setStatus("Submission deleted.");
    await loadSubmissions();
  } catch (error) {
    setStatus(error.message || "Unable to delete submission.", true);
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const key = adminKeyInput.value.trim();
  if (!key) {
    setStatus("Admin key is required.", true);
    return;
  }

  setAdminKey(key);
  await loadSubmissions();
});

refreshBtn.addEventListener("click", () => {
  loadSubmissions();
});

logoutBtn.addEventListener("click", () => {
  clearAdminKey();
  adminPanel.classList.add("hidden");
  submissionsContainer.innerHTML = "";
  adminKeyInput.value = "";
  setStatus("Logged out.");
});

submissionsContainer.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest(".delete-btn");
  if (!button) {
    return;
  }

  const id = Number(button.dataset.id);
  if (!Number.isInteger(id) || id <= 0) {
    setStatus("Invalid submission id.", true);
    return;
  }

  deleteSubmission(id);
});

loadSubmissions();
