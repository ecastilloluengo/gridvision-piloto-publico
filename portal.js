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

  const enlacesOffice365 = {
    novedades:
      "https://ingenieriacivilvicentesa.sharepoint.com/sites/OperacionesPecketEnergy/Lists/Novedades%20Operacionales/AllItems.aspx?FocusModeOff=1",

    fatiga:
      "https://ingenieriacivilvicentesa.sharepoint.com/sites/OperacionesPecketEnergy/Lists/Monitoreo%20Fatiga%20y%20Somnolencia/AllItems.aspx"
  };

  function abrirModulo(name) {

    if (enlacesOffice365[name]) {
      window.open(
        enlacesOffice365[name],
        "_blank"
      );

      return;
    }

    const info = moduleInfo[name] || {
      title: "M?dulo",
      message: "Este m?dulo se encuentra en desarrollo."
    };

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


  // =========================================================
  // PORTAL - MONITOREO PFV EN LINEA
  // =========================================================

  const PORTAL_BACKEND_BASE =
    (
      window.location.hostname === "localhost"
      || window.location.hostname === "127.0.0.1"
    )
      ? window.location.origin
      : "https://gridvision-piloto-publico.onrender.com";


  function numeroPortal(valor) {

    const numero = Number(valor);

    return Number.isFinite(numero)
      ? numero
      : null;
  }


  function formatearNumeroPortal(valor, decimales = 1) {

    const numero = numeroPortal(valor);

    if (numero === null) {
      return "--";
    }

    return numero.toLocaleString(
      "es-CL",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimales
      }
    );
  }


  function horaConsultaPortal() {

    return new Intl.DateTimeFormat(
      "es-CL",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }
    ).format(new Date());
  }


  function actualizarEstadoSolar(
    id,
    texto,
    tipo
  ) {

    const elementoEstado =
      $(`#solar-status-${id}`);

    if (!elementoEstado) {
      return;
    }

    elementoEstado.textContent = texto;

    elementoEstado.classList.remove(
      "estado-ok",
      "estado-espera",
      "estado-error"
    );

    elementoEstado.classList.add(
      tipo
    );
  }


  function actualizarValoresSolar(
    id,
    potenciaKw,
    energiaHoyKwh,
    textoActualizacion
  ) {

    const potencia =
      $(`#solar-power-${id}`);

    const energia =
      $(`#solar-energy-${id}`);

    const actualizacion =
      $(`#solar-update-${id}`);

    if (potencia) {
      potencia.textContent =
        potenciaKw === null
          ? "-- kW"
          : `${formatearNumeroPortal(
              potenciaKw,
              2
            )} kW`;
    }

    if (energia) {
      energia.textContent =
        energiaHoyKwh === null
          ? "-- kWh"
          : `${formatearNumeroPortal(
              energiaHoyKwh,
              1
            )} kWh`;
    }

    if (actualizacion) {
      actualizacion.textContent =
        textoActualizacion;
    }
  }


  function potenciaSolaxAKw(valor) {

  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return null;
  }

  // SolaX entrega acpower en W.
  // GridVision y el Portal muestran potencia en kW.
  return numero / 1000;
}


  async function cargarSolarLoAguirre() {

    const id = "lo-aguirre";

    try {

      const respuesta = await fetch(
        `${PORTAL_BACKEND_BASE}/api/solax/lo-aguirre`,
        {
          cache: "no-store"
        }
      );

      if (!respuesta.ok) {
        throw new Error(
          `HTTP ${respuesta.status}`
        );
      }

      const datos =
        await respuesta.json();

      const inversores =
        Array.isArray(datos.inversores)
          ? datos.inversores
          : [];

      // Mismo criterio utilizado por GridVision:
      // un dato SolaX con m?s de 10 minutos
      // se considera desactualizado.
      const UMBRAL_DATO_SOLAX_MS =
        10 * 60 * 1000;

      const ahoraSolax =
        Date.now();

      function datoSolaxVigente(
        inversor
      ) {

        if (
          !inversor
          || !inversor.ultimo_dato
        ) {
          return false;
        }

        const textoFecha =
          String(
            inversor.ultimo_dato
          ).replace(
            " ",
            "T"
          );

        const fechaDato =
          new Date(textoFecha);

        if (
          Number.isNaN(
            fechaDato.getTime()
          )
        ) {
          return false;
        }

        const edad =
          ahoraSolax
          - fechaDato.getTime();

        return (
          edad >= -120000
          && edad <= UMBRAL_DATO_SOLAX_MS
        );
      }

      const inversoresDisponibles =
        inversores.filter(
          inversor =>
            inversor
            && inversor.nivel !== "sin_datos"
            && datoSolaxVigente(inversor)
        ).length;

      actualizarInversoresSolar(
        id,
        inversoresDisponibles,
        inversores.length
      );

      let potenciaTotalKw = 0;
      let energiaHoyKwh = 0;

      let tienePotencia = false;
      let tieneEnergia = false;

      const fechas = [];

      for (const inversor of inversores) {

        const potenciaKw =
          potenciaSolaxAKw(
            inversor.potencia_ac
          );

        // Solo sumar potencia instant?nea
        // cuando la telemetr?a est? vigente.
        if (
          potenciaKw !== null
          && datoSolaxVigente(inversor)
        ) {
          potenciaTotalKw += potenciaKw;
          tienePotencia = true;
        }

        const energia =
          numeroPortal(
            inversor.energia_hoy
          );

        if (energia !== null) {
          energiaHoyKwh += energia;
          tieneEnergia = true;
        }

        if (inversor.ultimo_dato) {
          fechas.push(
            String(inversor.ultimo_dato)
          );
        }
      }

      const estado =
        String(
          datos.estado_general
          || "DESCONOCIDO"
        ).toUpperCase();

      let clase = "estado-espera";

      if (estado === "OK") {
        clase = "estado-ok";
      }

      if (
        estado === "FALLA"
        || estado === "SIN DATOS"
        || estado === "SIN COMUNICACION"
      ) {
        clase = "estado-error";
      }

      actualizarEstadoSolar(
        id,
        estado,
        clase
      );

      const ultimaFuente =
        fechas.length
          ? fechas.sort().at(-1)
          : null;

      actualizarValoresSolar(
        id,
        tienePotencia
          ? potenciaTotalKw
          : null,
        tieneEnergia
          ? energiaHoyKwh
          : null,
        ultimaFuente
          ? `Ultimo dato SolaX: ${ultimaFuente}`
          : `Ultima consulta: ${horaConsultaPortal()}`
      );

    } catch (error) {

      console.warn(
        "Portal SolaX Lo Aguirre:",
        error
      );

      actualizarEstadoSolar(
        id,
        "SIN DATOS",
        "estado-error"
      );

      actualizarValoresSolar(
        id,
        null,
        null,
        `Consulta fallida: ${horaConsultaPortal()}`
      );
    }
  }


  async function cargarSolarFusion(
    id,
    planta
  ) {

    try {

      const respuesta = await fetch(
        `${PORTAL_BACKEND_BASE}/api/fusionsolar/${planta}`,
        {
          cache: "no-store"
        }
      );

      if (!respuesta.ok) {

        let detalle = null;

        try {
          detalle =
            await respuesta.json();
        } catch (_) {
          detalle = null;
        }

        throw new Error(
          detalle?.estado
          || `HTTP ${respuesta.status}`
        );
      }

      const datos =
        await respuesta.json();

      const inversoresFusion =
        Array.isArray(datos.inversores)
          ? datos.inversores
          : [];

      const inversoresDisponibles =
        inversoresFusion.filter(
          inversor =>
            inversor
            && inversor.telemetria === true
        ).length;

      actualizarInversoresSolar(
        id,
        inversoresDisponibles,
        inversoresFusion.length
      );

      const potencia =
        numeroPortal(
          datos.potencia_instantanea_kw
        );

      const energia =
        numeroPortal(
          datos.energia_hoy_kwh
        );

      const estado =
        String(
          datos.estado
          || "DESCONOCIDO"
        ).toUpperCase();

      let clase = "estado-espera";

      if (estado === "OK") {
        clase = "estado-ok";
      }

      if (
        estado.includes("FALLA")
        || estado.includes("COMUNICACION")
        || estado === "DESCONOCIDO"
      ) {
        clase = "estado-error";
      }

      actualizarEstadoSolar(
        id,
        estado,
        clase
      );

      actualizarValoresSolar(
        id,
        potencia,
        energia,
        `Ultima consulta: ${horaConsultaPortal()}`
      );

    } catch (error) {

      console.warn(
        `Portal FusionSolar ${planta}:`,
        error
      );

      actualizarEstadoSolar(
        id,
        "SIN DATOS",
        "estado-error"
      );

      actualizarValoresSolar(
        id,
        null,
        null,
        `FusionSolar no disponible ? ${horaConsultaPortal()}`
      );
    }
  }



  // =========================================================
  // PORTAL - METEO Y ENLACES PFV
  // =========================================================

  const coordenadasPFVPortal = {};


  function actualizarInversoresSolar(
    id,
    disponibles,
    total
  ) {

    const elemento =
      $(`#solar-inverters-${id}`);

    if (!elemento) {
      return;
    }

    if (
      !Number.isFinite(disponibles)
      || !Number.isFinite(total)
      || total <= 0
    ) {
      elemento.textContent = "-- / --";
      return;
    }

    elemento.textContent =
      `${disponibles} / ${total}`;
  }


  async function resolverCoordenadasPFVPortal() {

    if (
      Object.keys(
        coordenadasPFVPortal
      ).length >= 3
    ) {
      return;
    }

    const respuesta = await fetch(
      "data/processed/pfv_netbilling.geojson",
      {
        cache: "no-store"
      }
    );

    if (!respuesta.ok) {
      throw new Error(
        `GeoJSON PFV HTTP ${respuesta.status}`
      );
    }

    const geo =
      await respuesta.json();

    for (
      const feature
      of geo.features || []
    ) {

      const id =
        feature?.properties?.id;

      const coords =
        feature?.geometry?.coordinates;

      if (
        !id
        || !Array.isArray(coords)
        || coords.length < 2
      ) {
        continue;
      }

      const lon =
        Number(coords[0]);

      const lat =
        Number(coords[1]);

      if (
        !Number.isFinite(lat)
        || !Number.isFinite(lon)
      ) {
        continue;
      }

      coordenadasPFVPortal[id] = {
        lat,
        lon
      };
    }
  }


  async function cargarMeteoPFV(
    idVisual,
    idActivo
  ) {

    try {

      await resolverCoordenadasPFVPortal();

      const coordenadas =
        coordenadasPFVPortal[idActivo];

      if (!coordenadas) {
        throw new Error(
          "Coordenadas PFV no disponibles"
        );
      }

      const url =
        new URL(
          "https://api.open-meteo.com/v1/forecast"
        );

      url.searchParams.set(
        "latitude",
        coordenadas.lat
      );

      url.searchParams.set(
        "longitude",
        coordenadas.lon
      );

      url.searchParams.set(
        "current",
        "shortwave_radiation,temperature_2m,cloud_cover"
      );

      url.searchParams.set(
        "timezone",
        "America/Santiago"
      );

      const respuesta =
        await fetch(
          url,
          {
            cache: "no-store"
          }
        );

      if (!respuesta.ok) {
        throw new Error(
          `Open-Meteo HTTP ${respuesta.status}`
        );
      }

      const datos =
        await respuesta.json();

      const actual =
        datos.current || {};

      const irradiancia =
        Number(
          actual.shortwave_radiation
        );

      const temperatura =
        Number(
          actual.temperature_2m
        );

      const nubosidad =
        Number(
          actual.cloud_cover
        );

      const elementoIrradiancia =
        $(`#solar-irradiance-${idVisual}`);

      const elementoTemperatura =
        $(`#solar-temperature-${idVisual}`);

      const elementoNubes =
        $(`#solar-clouds-${idVisual}`);

      if (elementoIrradiancia) {

        elementoIrradiancia.textContent =
          Number.isFinite(irradiancia)
            ? `${irradiancia.toLocaleString(
                "es-CL",
                {
                  maximumFractionDigits: 0
                }
              )} W/m\u00B2`
            : "-- W/m\u00B2";
      }

      if (elementoTemperatura) {

        elementoTemperatura.textContent =
          Number.isFinite(temperatura)
            ? `${temperatura.toLocaleString(
                "es-CL",
                {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1
                }
              )} \u00B0C`
            : "-- \u00B0C";
      }

      if (elementoNubes) {

        elementoNubes.textContent =
          Number.isFinite(nubosidad)
            ? `${nubosidad.toLocaleString(
                "es-CL",
                {
                  maximumFractionDigits: 0
                }
              )} %`
            : "-- %";
      }

    } catch (error) {

      console.warn(
        `Meteo PFV ${idActivo}:`,
        error
      );
    }
  }


  async function actualizarMeteoPFV() {

    await Promise.allSettled([

      cargarMeteoPFV(
        "lo-aguirre",
        "PFV-NB-001"
      ),

      cargarMeteoPFV(
        "techo",
        "PFV-NB-002"
      ),

      cargarMeteoPFV(
        "paidahuen",
        "PFV-NB-003"
      )

    ]);
  }


  async function abrirPFVEnGridVision(
    idActivo
  ) {

    try {

      await resolverCoordenadasPFVPortal();

      const coordenadas =
        coordenadasPFVPortal[idActivo];

      if (!coordenadas) {
        return;
      }

      const destino =
        new URL(
          "index.html",
          window.location.href
        );

      destino.searchParams.set(
        "lat",
        coordenadas.lat.toFixed(6)
      );

      destino.searchParams.set(
        "lng",
        coordenadas.lon.toFixed(6)
      );

      destino.searchParams.set(
        "zoom",
        "18"
      );

      window.location.href =
        destino.toString();

    } catch (error) {

      console.warn(
        "No fue posible abrir PFV en GridVision:",
        error
      );
    }
  }


  function activarEnlacesPFV() {

    document
      .querySelectorAll(
        ".solar-card[data-pfv-id]"
      )
      .forEach(
        tarjeta => {

          const abrir = () => {

            const idActivo =
              tarjeta.dataset.pfvId;

            if (idActivo) {
              abrirPFVEnGridVision(
                idActivo
              );
            }
          };

          tarjeta.addEventListener(
            "click",
            abrir
          );

          tarjeta.addEventListener(
            "keydown",
            evento => {

              if (
                evento.key === "Enter"
                || evento.key === " "
              ) {

                evento.preventDefault();

                abrir();
              }
            }
          );
        }
      );
  }



  // =========================================================
  // PORTAL - ACTUALIZACION MANUAL PFV
  // =========================================================

  const configuracionActualizacionPFV = {

    "lo-aguirre": {
      tipo: "solax",
      activo: "PFV-NB-001"
    },

    "techo": {
      tipo: "fusion",
      planta: "techo",
      activo: "PFV-NB-002"
    },

    "paidahuen": {
      tipo: "fusion",
      planta: "paidahuen",
      activo: "PFV-NB-003"
    }

  };


  async function actualizarTarjetaPFV(
    idVisual
  ) {

    const configuracion =
      configuracionActualizacionPFV[
        idVisual
      ];

    if (!configuracion) {
      return;
    }

    const boton =
      document.querySelector(
        `[data-solar-refresh="${idVisual}"]`
      );

    if (boton) {

      boton.disabled = true;

      boton.classList.add(
        "actualizando"
      );

      boton.title =
        "Actualizando datos...";
    }


    try {

      const tareas = [
        cargarMeteoPFV(
          idVisual,
          configuracion.activo
        )
      ];


      if (
        configuracion.tipo === "solax"
      ) {

        tareas.push(
          cargarSolarLoAguirre()
        );

      } else {

        tareas.push(
          cargarSolarFusion(
            idVisual,
            configuracion.planta
          )
        );
      }


      await Promise.allSettled(
        tareas
      );

    } finally {

      if (boton) {

        boton.disabled = false;

        boton.classList.remove(
          "actualizando"
        );

        boton.title =
          "Actualizar datos";
      }
    }
  }


  function activarBotonesActualizarPFV() {

    document
      .querySelectorAll(
        "[data-solar-refresh]"
      )
      .forEach(
        boton => {

          boton.addEventListener(
            "click",
            evento => {

              // No abrir GridVision al pulsar
              // solamente el boton actualizar.
              evento.preventDefault();
              evento.stopPropagation();

              actualizarTarjetaPFV(
                boton.dataset.solarRefresh
              );
            }
          );


          boton.addEventListener(
            "keydown",
            evento => {

              // Evita que Enter o espacio
              // activen tambien la tarjeta.
              evento.stopPropagation();
            }
          );
        }
      );
  }


  async function actualizarMonitoreoSolar() {

    await Promise.allSettled([
      cargarSolarLoAguirre(),

      cargarSolarFusion(
        "techo",
        "techo"
      ),

      cargarSolarFusion(
        "paidahuen",
        "paidahuen"
      )
    ]);
  }


  // =========================================================
  // PORTAL - CONTADORES ALERTAS REALES
  // =========================================================

  let alertaSenapredPrincipalPortal = null;
  let alertaClimaPrincipalPortal = null;


  function alertaSenapredVigente(alerta) {

    return (
      alerta
      && (
        alerta.estadoVigencia === "VIGENTE"
        || alerta.estadoVigencia === "VIGENTE_ACTUALIZADA"
      )
      && alerta.isDeleted !== true
    );
  }


  async function actualizarSenapredPortal() {

    const badge =
      document.getElementById(
        "badge-senapred"
      );

    try {

      const respuesta =
        await fetch(
          "data/alertas_senapred.json"
          + "?t="
          + Date.now(),
          {
            cache: "no-store"
          }
        );

      if (!respuesta.ok) {
        throw new Error(
          `HTTP ${respuesta.status}`
        );
      }

      const datos =
        await respuesta.json();

      const alertas =
        Array.isArray(datos.alertas)
          ? datos.alertas
          : [];

      const vigentes =
        alertas
          .filter(alertaSenapredVigente)
          .sort(
            (a, b) =>
              new Date(b.fechaHora || 0)
              - new Date(a.fechaHora || 0)
          );

      alertaSenapredPrincipalPortal =
        vigentes[0] || null;

      if (badge) {
        badge.textContent =
          String(vigentes.length);
      }

    }

    catch (error) {

      console.warn(
        "Portal SENAPRED:",
        error
      );

      if (badge) {
        badge.textContent = "--";
      }
    }
  }


  function estadoClimaActivo(estado) {

    return [
      "PRECAUCION",
      "ALERTA",
      "CRITICO"
    ].includes(
      String(estado || "")
        .toUpperCase()
    );
  }


  function actualizarClimaPortal() {

    const badge =
      document.getElementById(
        "badge-clima-gridvision"
      );

    const estados =
      Array.isArray(window.estadoAlertas)
        ? window.estadoAlertas
        : [];

    const prioridad = {
      CRITICO: 3,
      ALERTA: 2,
      PRECAUCION: 1
    };

    const activas =
      estados
        .filter(
          item =>
            estadoClimaActivo(
              item.estado
            )
        )
        .sort(
          (a, b) =>
            (
              prioridad[
                String(b.estado)
                  .toUpperCase()
              ] || 0
            )
            -
            (
              prioridad[
                String(a.estado)
                  .toUpperCase()
              ] || 0
            )
        );

    alertaClimaPrincipalPortal =
      activas[0] || null;

    if (badge) {
      badge.textContent =
        String(activas.length);
    }
  }


  // El monitor meteorologico de GridVision
  // llama esta funcion cada vez que cambia
  // el estado de una alerta.
  window.actualizarCentroAlertas =
    actualizarClimaPortal;


  const enlaceSenapred =
    document.getElementById(
      "nav-senapred"
    );

  enlaceSenapred
    ?.addEventListener(
      "click",
      evento => {

        evento.preventDefault();

        if (
          alertaSenapredPrincipalPortal
          ?.id
        ) {

          window.location.href =
            "index.html?senapred="
            + encodeURIComponent(
                alertaSenapredPrincipalPortal.id
              );

          return;
        }

        window.location.href =
          "index.html";
      }
    );


  const enlaceClima =
    document.getElementById(
      "nav-clima-gridvision"
    );

  enlaceClima
    ?.addEventListener(
      "click",
      evento => {

        evento.preventDefault();

        if (
          alertaClimaPrincipalPortal
          ?.id
        ) {

          window.location.href =
            "index.html?clima="
            + encodeURIComponent(
                alertaClimaPrincipalPortal.id
              );

          return;
        }

        window.location.href =
          "index.html";
      }
    );


  actualizarSenapredPortal();
  actualizarClimaPortal();

  // SENAPRED se revisa cada minuto.
  setInterval(
    actualizarSenapredPortal,
    60 * 1000
  );

  actualizarRelojes();
  setInterval(actualizarRelojes, 1000);
  actualizarClima();
  setInterval(actualizarClima, 10 * 60 * 1000);

  actualizarMonitoreoSolar();

  actualizarMeteoPFV();

  // =====================================================
  // REINTENTO INICIAL PFV
  // =====================================================
  // Algunas plataformas pueden no responder en la
  // primera consulta al entrar al Portal.
  // Se realiza un segundo intento autom?tico.
  setTimeout(
    () => {
      actualizarMonitoreoSolar();
    },
    3000
  );

  activarEnlacesPFV();

  activarBotonesActualizarPFV();

  // Si el navegador restaura el Portal al volver
  // desde GridVision u otra pagina, consultar nuevamente.
  window.addEventListener(
    "pageshow",
    evento => {

      if (evento.persisted) {

        actualizarMonitoreoSolar();

        actualizarMeteoPFV();
      }
    }
  );

  // Si el Portal estaba abierto en otra pesta?a
  // y vuelve a quedar visible, consultar nuevamente.
  document.addEventListener(
    "visibilitychange",
    () => {

      if (!document.hidden) {

        actualizarMonitoreoSolar();

        actualizarMeteoPFV();
      }
    }
  );

  // Actualizaci?n autom?tica del monitoreo PFV cada 1 minuto
  setInterval(
    actualizarMonitoreoSolar,
    1 * 60 * 1000
  );

  // El clima no necesita consultarse cada minuto
  setInterval(
    actualizarMeteoPFV,
    5 * 60 * 1000
  );
})();
