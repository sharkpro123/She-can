const form = document.getElementById("contact-form");
const statusMessage = document.getElementById("status-message");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const messageInput = document.getElementById("message");
const submitButton = form.querySelector("button[type='submit']");

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const message = messageInput.value.trim();

  if (!name || !email || !message) {
    setStatus("Please fill in all fields.", true);
    return;
  }

  if (!emailInput.checkValidity()) {
    setStatus("Please enter a valid email address.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  setStatus("Submitting your message...");

  fetch("/api/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, email, message }),
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Something went wrong.");
      }

      setStatus(payload.message || "Form Submitted Successfully");
      form.reset();
    })
    .catch(() => {
      setStatus("Unable to submit right now. Please try again.", true);
    })
    .finally(() => {
      submitButton.disabled = false;
      submitButton.textContent = "Submit";
    });
});
