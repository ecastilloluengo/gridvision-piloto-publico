(() => {
  const $ = (sel) => document.querySelector(sel);

  const timeEl = $("#portal-time");
  const dateEl = $("#portal-date");
  const modal = $("#module-modal");
  const modalTitle = $("#modal-title");
  const modalMessage = $("#modal-message");
  const closeBtn = $("#modal-close");
  const okBtn = $("#modal-ok");

  const moduleInfo = {
    "centro-control": {
      title: "Centro de Control",
      message: "Acceso al entorno operacional del Centro de Control. Este módulo se irá habilitando por etapas."
    },
    "monitoreo": {
      title: "Monitoreo",
      message: "Acceso al monitoreo de variables, generación, alarmas y desempeño de activos."
    },
    "novedades": {
      title: "Novedades Operacionales",
      message: "Aquí construiremos la bitácora centralizada de eventos, fallas, seguimiento y reportes."
    },
    "kpi": {
      title: "Indicadores y KPI",
      message: "Aquí se concentrarán indicadores semanales, mensuales, disponibilidad, MTTR, MTBF y tendencias."
    },
    "alertas": {
      title: "Alertas",
      message: "Módulo de alertas operacionales en desarrollo."
    },
    "configuracion": {
      title: "Configuración",
      message: "Configuración del portal en desarrollo."
    },
    "ayuda": {
      title: "Ayuda",
      message: "Centro de ayuda del Portal Operacional Pecket Energy."
    }
  };

  function updateClock() {
    const now = new Date();
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    }
  }

  function openModule(name) {
    const info = moduleInfo[name] || {
      title: "Módulo",
      message: "Este módulo se encuentra en desarrollo."
    };

    if (!modal) return;
    modalTitle.textContent = info.title;
    modalMessage.textContent = info.message;
    modal.hidden = false;
  }

  function closeModal() {
    if (modal) modal.hidden = true;
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-module]");
    if (!target) return;

    const moduleName = target.dataset.module;

    // Destinos reales futuros:
    // if (moduleName === "novedades") window.location.href = "novedades.html";
    // if (moduleName === "monitoreo") window.location.href = "monitoreo.html";

    openModule(moduleName);
  });

  closeBtn?.addEventListener("click", closeModal);
  okBtn?.addEventListener("click", closeModal);

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  updateClock();
  setInterval(updateClock, 1000);
})();
