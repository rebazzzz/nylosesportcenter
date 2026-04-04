document.addEventListener("DOMContentLoaded", async () => {
  const ADMIN_LOGIN_API_BASE_URL = `${window.location.origin}/api`;
  const loginForm = document.getElementById("admin-login-form");
  const errorMessage = document.getElementById("error-message");
  const submitButton = loginForm.querySelector('button[type="submit"]');

  async function getCurrentUser() {
    const cachedUser = sessionStorage.getItem("user");
    if (!cachedUser) return null;

    try {
      JSON.parse(cachedUser);
    } catch (error) {
      sessionStorage.removeItem("user");
      return null;
    }

    try {
      const response = await fetch(`${ADMIN_LOGIN_API_BASE_URL}/auth/me`, {
        credentials: "same-origin",
      });

      if (!response.ok) {
        sessionStorage.removeItem("user");
        return null;
      }

      const data = await response.json();
      sessionStorage.setItem("user", JSON.stringify(data.user));
      return data.user;
    } catch (error) {
      sessionStorage.removeItem("user");
      return null;
    }
  }

  const existingUser = await getCurrentUser();
  if (existingUser && existingUser.role === "admin") {
    window.location.href = "admin-dashboard.html";
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    errorMessage.textContent = "";

    if (!email || !password) {
      errorMessage.textContent = "Fyll i alla fält.";
      return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Loggar in...';

    try {
      const response = await fetch(`${ADMIN_LOGIN_API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
        window.location.href = "admin-dashboard.html";
      } else {
        errorMessage.textContent = data.error || "Inloggning misslyckades.";
      }
    } catch (error) {
      console.error("Login error:", error);
      errorMessage.textContent = "Ett fel uppstod. Försök igen senare.";
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Logga in';
    }
  });
});
