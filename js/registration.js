const REGISTRATION_API_BASE_URL = `${window.location.origin}/api`;

function setRegistrationFeedback(message, type = "info") {
  const feedback = document.getElementById("registration-feedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.className = `form-feedback ${type}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const personnummerInput = document.getElementById("personnummer");
  const parentFields = document.querySelectorAll(".parent-field");
  const registerBtn = document.getElementById("register-btn");
  const registrationForm = document.querySelector(".registration-form");

  function parseBirthDateFromPersonnummer(personnummer) {
    const digits = personnummer.replace(/[^0-9]/g, "");
    if (digits.length !== 12) return null;

    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    const birthDate = new Date(year, month - 1, day);

    if (
      Number.isNaN(birthDate.getTime()) ||
      birthDate.getFullYear() !== year ||
      birthDate.getMonth() !== month - 1 ||
      birthDate.getDate() !== day
    ) {
      return null;
    }

    birthDate.setHours(0, 0, 0, 0);
    return birthDate;
  }

  function calculateAgeFromPersonnummer(personnummer, referenceDate = new Date()) {
    const birthDate = parseBirthDateFromPersonnummer(personnummer);
    if (!birthDate) return null;

    const today = new Date(referenceDate);
    today.setHours(0, 0, 0, 0);

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return age;
  }

  function toggleParentFields(isVisible) {
    parentFields.forEach((field) => {
      field.style.display = isVisible ? "flex" : "none";
      field.setAttribute("aria-hidden", String(!isVisible));

      const input = field.querySelector("input");
      if (input) {
        input.required = isVisible;
        input.disabled = !isVisible;

        if (!isVisible) {
          input.value = "";
        }
      }
    });
  }

  if (personnummerInput) {
    personnummerInput.addEventListener("input", (event) => {
      let value = event.target.value.replace(/[^0-9]/g, "");
      if (value.length > 12) {
        value = value.slice(0, 12);
      }

      if (value.length >= 8) {
        value = `${value.slice(0, 8)}-${value.slice(8)}`;
      }

      event.target.value = value;
      const age = calculateAgeFromPersonnummer(value);
      toggleParentFields(age !== null && age < 18);
    });
  }

  toggleParentFields(false);

  if (registrationForm && registerBtn) {
    registrationForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(registrationForm);
      const personnummer = String(formData.get("personnummer") || "").replace(
        /[^0-9-]/g,
        "",
      );
      const age = calculateAgeFromPersonnummer(personnummer);
      const isMinor = age !== null && age < 18;

      const registrationData = {
        first_name: formData.get("firstname"),
        last_name: formData.get("lastname"),
        personnummer,
        email: formData.get("email"),
        phone: formData.get("phone"),
        address: formData.get("address"),
        website: formData.get("website") || "",
      };

      if (isMinor) {
        registrationData.parent_name = formData.get("parent-name");
        registrationData.parent_lastname = formData.get("parent-lastname");
        registrationData.parent_phone = formData.get("parent-phone");
      }

      registerBtn.disabled = true;
      registerBtn.classList.add("is-loading");
      registerBtn.textContent = "Skickar...";
      setRegistrationFeedback("Skickar din anmälan...", "info");

      try {
        const registerResponse = await fetch(
          `${REGISTRATION_API_BASE_URL}/auth/register`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(registrationData),
          },
        );

        const registerResult = await registerResponse.json();

        if (registerResponse.ok) {
          registrationForm.reset();
          toggleParentFields(false);
          setRegistrationFeedback(
            "Tack! Din anmälan är skickad.",
            "success",
          );
        } else {
          setRegistrationFeedback(
            registerResult.error || "Registreringen kunde inte genomföras.",
            "error",
          );
        }
      } catch (error) {
        console.error("Registration error:", error);
        setRegistrationFeedback("Ett fel uppstod. Försök igen senare.", "error");
      } finally {
        registerBtn.disabled = false;
        registerBtn.classList.remove("is-loading");
        registerBtn.textContent = "Skicka anmälan";
      }
    });
  }
});
