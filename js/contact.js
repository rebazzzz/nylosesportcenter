const CONTACT_API_BASE_URL = `${window.location.origin}/api`;

function setContactFeedback(message, type = "info") {
  const feedback = document.getElementById("contact-form-feedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.className = `form-feedback ${type}`;
}

function initializeFaqAccordion() {
  document.querySelectorAll(".faq-question").forEach((button) => {
    button.setAttribute("aria-expanded", "false");

    button.addEventListener("click", function () {
      const faqItem = this.parentElement;
      const isActive = faqItem.classList.contains("active");

      document.querySelectorAll(".faq-item").forEach((item) => {
        item.classList.remove("active");
        item.querySelector(".faq-question")?.setAttribute("aria-expanded", "false");
      });

      if (!isActive) {
        faqItem.classList.add("active");
        this.setAttribute("aria-expanded", "true");
      }
    });
  });
}

function initializeContactForm() {
  const contactForm = document.getElementById("contact-form");
  if (!contactForm) return;

  const submitButton = contactForm.querySelector('button[type="submit"]');

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      message: document.getElementById("message").value.trim(),
      website: contactForm.querySelector('[name="website"]')?.value || "",
    };

    submitButton.disabled = true;
    submitButton.classList.add("is-loading");
    submitButton.textContent = "Skickar...";
    setContactFeedback("Skickar ditt meddelande...", "info");

    try {
      const response = await fetch(`${CONTACT_API_BASE_URL}/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Meddelandet kunde inte skickas");
      }

      contactForm.reset();
      setContactFeedback(
        "Tack! Ditt meddelande har skickats och klubben återkommer så snart som möjligt.",
        "success",
      );
    } catch (error) {
      console.error("Contact submission error:", error);
      setContactFeedback(
        error.message || "Ett fel uppstod. Försök igen senare.",
        "error",
      );
    } finally {
      submitButton.disabled = false;
      submitButton.classList.remove("is-loading");
      submitButton.textContent = "Skicka meddelande";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initializeFaqAccordion();
  initializeContactForm();
});
