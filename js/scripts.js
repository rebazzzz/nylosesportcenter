const MEDIA_MANIFEST = window.NYLOSE_MEDIA || {
  carouselImages: [],
};

const GALLERY_IMAGES = MEDIA_MANIFEST.carouselImages.map((src) => ({
  type: "image",
  src,
}));
const ALL_GALLERY_MEDIA = [...GALLERY_IMAGES];
const FULL_GALLERY_BATCH_SIZE = 12;
let galleryVisibleCount = FULL_GALLERY_BATCH_SIZE;

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

function toggleMenu() {
  const navLinks = document.querySelector(".nav-links");
  const hamburger = document.querySelector(".hamburger");
  const overlay = document.querySelector(".menu-overlay");

  if (!navLinks || !hamburger || !overlay) return;

  const isActive = navLinks.classList.toggle("active");
  hamburger.classList.toggle("active");
  overlay.classList.toggle("active");
  hamburger.setAttribute("aria-expanded", String(isActive));
  syncMenuState(isActive);
}

window.toggleMenu = toggleMenu;
window.closeMenu = closeMenu;

function closeMenu() {
  const navLinks = document.querySelector(".nav-links");
  const hamburger = document.querySelector(".hamburger");
  const overlay = document.querySelector(".menu-overlay");

  navLinks?.classList.remove("active");
  hamburger?.classList.remove("active");
  overlay?.classList.remove("active");
  hamburger?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("menu-open");
}

function syncMenuState(isOpen) {
  document.body.classList.toggle("menu-open", isOpen);
}

function initializeSharedUi() {
  setActiveNavLink();

  closeMenu();

  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeMenu();
    }
  });
}

function initializeBackToTopButton() {
  const backToTopButton = document.getElementById("back-to-top");
  if (!backToTopButton) return;

  const updateVisibility = () => {
    const isVisible = window.scrollY > 500;
    backToTopButton.classList.toggle("visible", isVisible);
    backToTopButton.setAttribute("aria-hidden", String(!isVisible));
  };

  backToTopButton.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
}

function initializeScheduleFilters() {
  const filterButtons = document.querySelectorAll(".filter-btn");
  const dayContainers = document.querySelectorAll(".day-container");

  if (filterButtons.length === 0 || dayContainers.length === 0) return;

  const applyFilter = (filter) => {
    dayContainers.forEach((day) => {
      let hasVisibleSession = false;

      day.querySelectorAll(".session-card").forEach((session) => {
        const shouldShow =
          filter === "all" || session.dataset.filter === filter;

        session.hidden = !shouldShow;
        session.style.display = shouldShow ? "" : "none";
        if (shouldShow) {
          hasVisibleSession = true;
        }
      });

      day.hidden = !hasVisibleSession;
      day.style.display = hasVisibleSession ? "" : "none";
    });

    filterButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === filter);
    });
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyFilter(button.dataset.filter || "all");
    });
  });

  applyFilter("all");
}

function buildGalleryCard(media) {
  return `
    <article class="media-card">
      <div class="media-frame">
        <img src="${media.src}" alt="Bild från Nylöse SportCenter" loading="lazy" decoding="async">
      </div>
    </article>
  `;
}

function getFilteredGalleryMedia() {
  return ALL_GALLERY_MEDIA;
}

function renderGallery() {
  const fullGallery = document.getElementById("full-gallery-grid");
  const loadMoreButton = document.getElementById("gallery-load-more");

  if (!fullGallery) return;

  const visibleMedia = getFilteredGalleryMedia().slice(0, galleryVisibleCount);
  fullGallery.innerHTML = visibleMedia.map((media) => buildGalleryCard(media)).join("");

  if (loadMoreButton) {
    loadMoreButton.hidden = galleryVisibleCount >= getFilteredGalleryMedia().length;
  }
}

function initializeGalleryControls() {
  const fullGallery = document.getElementById("full-gallery-grid");
  const loadMoreButton = document.getElementById("gallery-load-more");
  if (!fullGallery) return;

  loadMoreButton?.addEventListener("click", () => {
    galleryVisibleCount += FULL_GALLERY_BATCH_SIZE;
    renderGallery();
  });

  renderGallery();
}

document.addEventListener("DOMContentLoaded", () => {
  initializeSharedUi();
  initializeBackToTopButton();
  initializeScheduleFilters();
  initializeGalleryControls();
});
