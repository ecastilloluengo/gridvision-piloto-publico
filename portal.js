(() => {
  const $ = (sel) => document.querySelector(sel);
  const modal = $("#module-modal");
  const modalTitle = $("#modal-title");
  const modalMessage = $("#modal-message");

  const moduleInfo = {
    novedades: {
      title: "Novedades Operacionales",
      message: "Acceso a la bitácora digital, seguimiento y reportes operacionales."
    },
    fatiga: {
      title: "Monitoreo de Fatiga y Somnolencia",
      message: "Acceso al monitoreo de alertas, fatiga y somnolencia de operadores."
    },
    "kpi-electricos": {
      title: "Indicadores - KPI Activos Eléctricos",
      message: "Disponibilidad, Confiabilidad, MTTR, MTBF y otros indicadores de desempeño."
    },
    "kpi-fatiga": {
      title: "Indicadores - KPI Fatiga y Somnolencia",
      message: "Alertas, Fatiga, Somnolencia y conductor al teléfono por faenas."
    },
    alertas: { title: "Alertas", message: "Módulo de alertas operacionales." },
    configuracion: { title: "Configuración", message: "Configuración del portal." },
    ayuda: { title: "Ayuda", message: "Centro de ayuda del Portal Operacional Pecket Energy." }
  };

  const zonas = {
    osorno: {
      lat: -40.5740,
      lon: -73.1330,
      timeZone: "America/Santiago"
    },
    capullo: {
      lat: -40.68,
      lon: -72.60,
      timeZone: "America/Santiago"
    },
    punta: {
      lat: -53.1638,
      lon: -70.9171,
      timeZone: "America/Punta_Arenas"
    }
  };

  function getPropId(feature) {
    const p = feature?.properties || {};
    return String(p.id ?? p.ID ?? p.Id ?? "").trim();
  }

  async function resolverCoordenadasCapulloPulelfu() {
    try {
      const r = await fetch("data/processed/activos_puntuales_validados.geojson", { cache: "no-store" });
      if (!r.ok) return;
      const geo = await r.json();
      const ids = new Set(["GV-02505", "GV-02559"]);
      const puntos = (geo.features || [])
        .filter(f => ids.has(getPropId(f)) && f.geometry?.type === "Point")
        .map(f => f.geometry.coordinates)
        .filter(c => Array.isArray(c) && c.length >= 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1])));

      if (!puntos.length) return;
      const lon = puntos.reduce((s, c) => s + Number(c[0]), 0) / puntos.length;
      const lat = puntos.reduce((s, c) => s + Number(c[1]), 0) / puntos.length;
      zonas.capullo.lat = lat;
      zonas.capullo.lon = lon;
    } catch (error) {
      console.warn("No fue posible resolver coordenadas Capullo/Pulelfu desde GridVision:", error);
    }
  }

  function formatearHora(zona) {
    return new Intl.DateTimeFormat("es-CL", {
      timeZone: zona.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date());
  }

  function formatearFecha(zona) {
    return new Intl.DateTimeFormat("es-CL", {
      timeZone: zona.timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date());
  }

  function actualizarRelojes() {
    for (const [id, zona] of Object.entries(zonas)) {
      const timeEl = $(`#time-${id}`);
      const dateEl = $(`#date-${id}`);
      if (timeEl) timeEl.textContent = formatearHora(zona);
      if (dateEl) dateEl.textContent = formatearFecha(zona);
    }
  }

  function descripcionWmo(code) {
    const c = Number(code);
    if (c === 0) return "Despejado";
    if ([1,2].includes(c)) return "Parcialmente nublado";
    if (c === 3) return "Nublado";
    if ([45,48].includes(c)) return "Niebla";
    if ([51,53,55,56,57].includes(c)) return "Llovizna";
    if ([61,63,65,66,67].includes(c)) return "Lluvia";
    if ([71,73,75,77].includes(c)) return "Nieve";
    if ([80,81,82].includes(c)) return "Chubascos";
    if ([85,86].includes(c)) return "Chubascos de nieve";
    if ([95,96,99].includes(c)) return "Tormenta";
    return "Disponible";
  }

  async function cargarClima(id, zona) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", zona.lat);
    url.searchParams.set("longitude", zona.lon);
    url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
    url.searchParams.set("timezone", zona.timeZone);
    url.searchParams.set("forecast_days", "1");

    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const actual = data.current || {};
      const temp = Number(actual.temperature_2m);
      const wind = Number(actual.wind_speed_10m);
      const code = Number(actual.weather_code);

      const tempEl = $(`#temp-${id}`);
      const condEl = $(`#condition-${id}`);
      const windEl = $(`#wind-${id}`);
      if (tempEl) tempEl.textContent = Number.isFinite(temp) ? `${temp.toLocaleString("es-CL", {maximumFractionDigits:1})}°C` : "--°C";
      if (condEl) condEl.textContent = descripcionWmo(code);
      if (windEl) windEl.textContent = Number.isFinite(wind) ? `${wind.toLocaleString("es-CL", {maximumFractionDigits:1})} km/h` : "-- km/h";
    } catch (error) {
      console.warn(`Clima ${id}:`, error);
      const condEl = $(`#condition-${id}`);
      if (condEl) condEl.textContent = "Sin datos";
    }
  }

  async function actualizarClima() {
    await resolverCoordenadasCapulloPulelfu();
    await Promise.all(Object.entries(zonas).map(([id, zona]) => cargarClima(id, zona)));
  }

  function abrirModulo(name) {
    const info = moduleInfo[name] || { title: "Módulo", message: "Este módulo se encuentra en desarrollo." };
    if (!modal) return;
    modalTitle.textContent = info.title;
    modalMessage.textContent = info.message;
    modal.hidden = false;
  }

  function cerrarModal() { if (modal) modal.hidden = true; }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-module]");
    if (target) abrirModulo(target.dataset.module);
  });
  $("#modal-close")?.addEventListener("click", cerrarModal);
  $("#modal-ok")?.addEventListener("click", cerrarModal);
  modal?.addEventListener("click", (e) => { if (e.target === modal) cerrarModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });

  actualizarRelojes();
  setInterval(actualizarRelojes, 1000);
  actualizarClima();
  setInterval(actualizarClima, 10 * 60 * 1000);
})();
