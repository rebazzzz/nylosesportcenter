function getCurrentPage() {
  const currentPath = window.location.pathname.split("/").pop();
  return currentPath || "index.html";
}

function setActiveNavLink() {
  const currentPage = getCurrentPage();
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("current", link.dataset.nav === currentPage);
  });
}

function closeLegacyMenu() {
  document.querySelector(".nav-links")?.classList.remove("active");
  document.querySelector(".hamburger")?.classList.remove("active");
  document.querySelector(".menu-overlay")?.classList.remove("active");
  document.querySelector(".hamburger")?.setAttribute("aria-expanded", "false");
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLegacyMenu();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setActiveNavLink();
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", closeLegacyMenu);
  });
});
