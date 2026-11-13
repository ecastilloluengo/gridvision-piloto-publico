
/* GV PORTAL CONTADORES OFFLINE V2154 */

const gvContadoresOffline = (() => {

  const PREFIJO = 'gv-portal-contador-v1:';
  const memoria = new Map();

  function fecha(ms) {
    return new Intl.DateTimeFormat('es-CL', {
      timeZone: 'America/Santiago',
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(ms));
  }

  function leer(id) {

    let dato = memoria.get(id);

    if (!dato) {
      try {
        dato = JSON.parse(localStorage.getItem(PREFIJO + id) || 'null');
      } catch (_) {}
    }

    if (!dato ||
        !Number.isInteger(dato.numero) ||
        dato.numero < 0 ||
        !Number.isFinite(dato.fuente) ||
        !Number.isFinite(dato.guardadoEn)) {
      return null;
    }

    return dato;
  }

  function guardar(id, numero, fuente) {

    if (!navigator.onLine ||
        !Number.isInteger(numero) ||
        numero < 0 ||
        !Number.isFinite(fuente) ||
        fuente > Date.now() + 120000) return false;

    const anterior = leer(id);

    if (anterior && fuente < anterior.fuente) return false;

    const dato = {
      numero,
      fuente,
      guardadoEn: Date.now()
    };

    memoria.set(id, dato);

    try {
      localStorage.setItem(PREFIJO + id, JSON.stringify(dato));
    } catch (_) {}

    return true;
  }

  function limpiar(id) {

    const badge = document.getElementById('badge-' + id);

    if (!badge) return;

    if (badge.dataset.gvHistorico) {

      badge.style.removeProperty('color');
      badge.style.removeProperty('border-color');
      badge.style.removeProperty('background-color');

      delete badge.dataset.gvHistorico;
    }
  }

  function historico(id, motivo) {

    const badge = document.getElementById('badge-' + id);
    const dato = leer(id);

    if (!badge) return;

    badge.textContent = dato ? dato.numero + '*' : '\u2014';

    badge.classList.remove(
      'sitr-badge-ok',
      'sitr-badge-error'
    );

    badge.dataset.gvHistorico = 'true';

    badge.style.color = '#ffbf47';
    badge.style.borderColor = '#99733b';
    badge.style.backgroundColor = 'rgba(148,99,21,.18)';

    const descripcion = dato
      ? motivo + '. Ultimo conteo: ' + dato.numero +
        '. Fuente: ' + fecha(dato.fuente) +
        '. Estado actual no verificable.'
      : motivo + '. Sin respaldo disponible.';

    badge.title = descripcion;
    badge.setAttribute('aria-label', descripcion);
  }

  // Convertir fecha CEN local de Chile a instante UTC.
  // Admite dd-mm-aaaa, dd/mm/aaaa e ISO con zona horaria.

  function fechaCEN(valor) {

    const texto = String(valor || '').trim();

    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(texto)) {
      return Date.parse(texto);
    }

    const m = texto.match(
      /^(\d{2})[-/](\d{2})[-/](\d{4})\s+(\d{2}):(\d{2})$/
    );

    if (!m) return NaN;

    const [dia, mes, anio, hora, minuto] = m.slice(1).map(Number);

    const base = Date.UTC(anio, mes - 1, dia, hora, minuto);

    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });

    const candidatos = [];

    for (const offset of [3, 4]) {

      const ms = base + offset * 3600000;

      const partes = Object.fromEntries(
        fmt.formatToParts(ms).map(p => [p.type, Number(p.value)])
      );

      if (partes.year === anio &&
          partes.month === mes &&
          partes.day === dia &&
          partes.hour === hora &&
          partes.minute === minuto) {
        candidatos.push(ms);
      }
    }

    return candidatos.length ? Math.min(...candidatos) : NaN;
  }

  function resumen() {
    return ['sitr', 'senapred'].map(id => {

      const dato = leer(id);
      const badge = document.getElementById('badge-' + id);
      let persistido = false;

      try {
        persistido = Boolean(localStorage.getItem(PREFIJO + id));
      } catch (_) {}

      return {
        fuente: id,
        guardado: Boolean(dato),
        persistido,
        conteo: dato?.numero ?? null,
        fecha: dato ? fecha(dato.fuente) : null,
        visible: badge?.textContent,
        historico: Boolean(badge?.dataset.gvHistorico)
      };
    });
  }

  return {
    leer, guardar, limpiar, historico, fechaCEN, resumen
  };

})();

window.GVPortalContadoresOffline = {
  resumen: gvContadoresOffline.resumen
};


(() => {
  const $ = (sel) => document.querySelector(sel);

  // GV PORTAL SOLAR OFFLINE V2153

  const solarOffline = (() => {

    const PREFIJO = 'gv-portal-solar-v1:';
    const ids = ['lo-aguirre', 'techo', 'paidahuen'];
    const memoria = new Map();

    const campos = [
      'power', 'energy', 'inverters', 'status', 'update'
    ];

    function el(id, campo) {
      return document.getElementById('solar-' + campo + '-' + id);
    }

    function valido(v) {
      return v !== null &&
        v !== undefined &&
        String(v).trim() !== '' &&
        Number.isFinite(Number(v));
    }

    function fecha(v) {
      const d = new Date(v);
      if (!Number.isFinite(d.getTime())) return 'No informada';

      return new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(d);
    }

    function leer(id) {
      let dato = memoria.get(id);

      if (!dato) {
        try {
          dato = JSON.parse(
            localStorage.getItem(PREFIJO + id) || 'null'
          );
        } catch (_) {}
      }

      if (
        !dato ||
        !Number.isFinite(Date.parse(dato.guardadoEn)) ||
        !Number.isFinite(Date.parse(dato.fuente)) ||
        !campos.every(c => typeof dato.valores?.[c] === 'string')
      ) return null;

      return dato;
    }

    function etiquetas(id, historico) {

      const nombres = {
        power: historico ? 'Potencia registrada' : 'Potencia actual',
        energy: historico ? 'Energia registrada' : 'Energ\u00EDa hoy',
        inverters: historico
          ? 'Ultimo conteo'
          : id === 'lo-aguirre'
            ? 'Operativos confirmados'
            : 'Inversores'
      };

      for (const [campo, texto] of Object.entries(nombres)) {
        const etiqueta = el(id, campo)?.parentElement?.querySelector('span');

        if (etiqueta) {
          etiqueta.textContent = texto;
        }
      }
    }

    function normal(id) {

      etiquetas(id, false);

      campos.forEach(c => {
        const elemento = el(id, c);
        if (!elemento) return;

        if (elemento.dataset.gvSolarHistorico) {
          elemento.removeAttribute('title');
          delete elemento.dataset.gvSolarHistorico;
        }
      });
    }

    function guardar(id, fuente) {

      if (!navigator.onLine) {
        restaurar(id);
        return false;
      }

      if (!Number.isFinite(Date.parse(fuente))) {
        return false;
      }

      const valores = {};

      for (const campo of campos) {

        const elemento = el(id, campo);

        if (!elemento) return false;

        valores[campo] = elemento.textContent.trim();
      }

      const dato = {
        guardadoEn: new Date().toISOString(),
        fuente,
        valores
      };

      memoria.set(id, dato);

      try {
        localStorage.setItem(
          PREFIJO + id,
          JSON.stringify(dato)
        );
      } catch (error) {
        console.warn('No se pudo persistir respaldo PFV', error);
      }

      normal(id);
      return true;
    }

    function restaurar(id) {

      const dato = leer(id);

      etiquetas(id, true);

      for (const campo of ['power', 'energy', 'inverters']) {

        const elemento = el(id, campo);

        if (!elemento) continue;

        elemento.textContent = dato
          ? dato.valores[campo]
          : {
              power: '-- kW',
              energy: '-- kWh',
              inverters: '-- / --'
            }[campo];

        elemento.title = dato
          ? 'Dato historico. Lectura: ' + fecha(dato.fuente)
          : 'Sin datos guardados';

        elemento.dataset.gvSolarHistorico = 'true';
      }

      const estado = el(id, 'status');

      if (estado) {

        estado.classList.remove(
          'estado-ok',
          'estado-error',
          'estado-espera'
        );

        estado.classList.add('estado-espera');

        estado.textContent = dato
          ? 'HISTORICO'
          : 'SIN RESPALDO';

        estado.title = dato
          ? 'Ultimo estado conocido: ' + dato.valores.status
          : 'No existe una lectura valida almacenada';

        estado.dataset.gvSolarHistorico = 'true';
      }

      const actualizacion = el(id, 'update');

      if (actualizacion) {

        actualizacion.textContent = dato
          ? 'Historico: ' + fecha(dato.fuente) +
            ' | Ult. estado: ' + dato.valores.status
          : 'Sin lectura electrica guardada';

        actualizacion.title = dato
          ? dato.valores.update +
            ' | Guardado: ' + fecha(dato.guardadoEn)
          : 'Se requiere una consulta exitosa con internet';

        actualizacion.dataset.gvSolarHistorico = 'true';
      }

      if (id === 'lo-aguirre') {

        const detalle = document.getElementById(
          'solar-inverters-detail-lo-aguirre'
        );

        if (detalle) {
          detalle.textContent = 'Estado actual de equipos no verificable';
        }

        const dialogo = document.getElementById('gv-solax-v5-dialogo');
        if (dialogo?.open) dialogo.close();
      }

      return Boolean(dato);
    }

    function restaurarTodo() {
      ids.forEach(restaurar);

      const dialogo = document.getElementById('gv-fusion-diagnostico');
      if (dialogo?.open) dialogo.close();
    }

    function parcial(id) {

      if (leer(id)) {
        restaurar(id);
        return;
      }

      const estado = el(id, 'status');

      if (estado) {
        estado.classList.remove('estado-ok', 'estado-error');
        estado.classList.add('estado-espera');
        estado.textContent = 'NO VERIFICADO';
        estado.title = 'Lectura incompleta. Sin respaldo completo.';
      }
    }

    function resumen() {

      return ids.map(id => {

        const dato = leer(id);
        let persistido = false;

        try {
          persistido = Boolean(localStorage.getItem(PREFIJO + id));
        } catch (_) {}

        return {
          planta: id,
          guardado: Boolean(dato),
          persistido,
          potencia: dato?.valores.power || null,
          energia: dato?.valores.energy || null,
          estado: dato?.valores.status || null,
          fuente: dato?.fuente || null,
          fecha: dato?.guardadoEn || null
        };
      });
    }

    return {
      valido,
      guardar,
      restaurar,
      restaurarTodo,
      parcial,
      normal,
      resumen
    };

  })();

  window.GVPortalSolarOffline = {
    resumen: solarOffline.resumen
  };



  // GV PORTAL METEO OFFLINE V2152

  const meteoOffline = (() => {

    const PREFIJO = 'gv-portal-meteo-v1:';
    const memoria = new Map();

    const zonas = ['osorno', 'capullo', 'punta'];
    const plantas = ['lo-aguirre', 'techo', 'paidahuen'];

    const camposClima = [
      'temp', 'condition', 'wind', 'gust', 'uv'
    ];

    const camposPFV = [
      'solar-irradiance',
      'solar-temperature',
      'solar-clouds'
    ];

    function campos(tipo) {
      return tipo === 'clima' ? camposClima : camposPFV;
    }

    function elemento(campo, id) {
      return document.getElementById(campo + '-' + id);
    }

    function clave(tipo, id) {
      return PREFIJO + tipo + ':' + id;
    }

    function fechaLocal(iso) {
      return new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(iso));
    }

    function valido(valor) {
      return valor !== null
        && valor !== undefined
        && String(valor).trim() !== ''
        && Number.isFinite(Number(valor));
    }

    function leer(tipo, id) {
      const k = clave(tipo, id);
      let dato = memoria.get(k);

      if (!dato) {
        try {
          dato = JSON.parse(localStorage.getItem(k) || 'null');
        } catch (_) {}
      }

      if (
        !dato ||
        !Number.isFinite(Date.parse(dato.guardadoEn)) ||
        !campos(tipo).every(c => typeof dato.valores?.[c] === 'string')
      ) {
        return null;
      }

      return dato;
    }

    function marcar(tipo, id, dato, historico) {

      const nota = historico
        ? dato
          ? 'Historico: ' + fechaLocal(dato.guardadoEn)
          : 'Sin respaldo'
        : '';

      const titulo = historico
        ? nota + (dato?.horaFuente
            ? ' | Hora fuente: ' + dato.horaFuente
            : '')
        : '';

      if (tipo === 'clima') {

        const cond = elemento('condition', id);

        if (cond && historico) {
          cond.textContent = dato
            ? dato.valores.condition + ' | ' + nota
            : 'Sin datos guardados';

          cond.title = titulo;
        } else if (cond) {
          cond.removeAttribute('title');
        }

      } else {

        const ghi = elemento('solar-irradiance', id);
        const etiqueta = ghi?.parentElement?.querySelector('span');

        if (etiqueta) {
          etiqueta.textContent = historico
            ? 'GHI | ' + nota
            : 'Irradiancia GHI';

          etiqueta.title = titulo;
        }
      }

      for (const c of campos(tipo)) {
        const el = elemento(c, id);

        if (!el) continue;

        if (historico) {
          el.title = titulo;
          el.dataset.gvMeteoHistorico = 'true';
        } else {
          el.removeAttribute('title');
          delete el.dataset.gvMeteoHistorico;
        }
      }
    }

    function guardar(tipo, id, horaFuente) {

      if (!navigator.onLine) {
        restaurar(tipo, id);
        return;
      }

      const valores = {};

      for (const c of campos(tipo)) {
        const el = elemento(c, id);

        if (!el) return;

        valores[c] = el.textContent.trim();
      }

      const dato = {
        guardadoEn: new Date().toISOString(),
        horaFuente: horaFuente || null,
        valores
      };

      const k = clave(tipo, id);

      memoria.set(k, dato);

      try {
        localStorage.setItem(k, JSON.stringify(dato));
      } catch (error) {
        console.warn('No se pudo guardar respaldo meteorologico', error);
      }

      marcar(tipo, id, dato, false);
    }

    function restaurar(tipo, id) {
      const dato = leer(tipo, id);

      if (dato) {
        for (const c of campos(tipo)) {
          const el = elemento(c, id);

          if (el) {
            el.textContent = dato.valores[c];
          }
        }
      }

      marcar(tipo, id, dato, true);

      return Boolean(dato);
    }

    function restaurarTodo() {
      zonas.forEach(id => restaurar('clima', id));
      plantas.forEach(id => restaurar('pfv', id));
    }

    function resumen() {

      const grupos = [
        ...zonas.map(id => ['clima', id]),
        ...plantas.map(id => ['pfv', id])
      ];

      return grupos.map(([tipo, id]) => {

        const dato = leer(tipo, id);
        let persistido = false;

        try {
          persistido = Boolean(localStorage.getItem(clave(tipo, id)));
        } catch (_) {}

        return {
          tipo,
          id,
          guardado: Boolean(dato),
          persistido,
          fecha: dato?.guardadoEn || null,
          fuente: dato?.horaFuente || null
        };
      });
    }

    return {
      valido,
      guardar,
      restaurar,
      restaurarTodo,
      resumen
    };

  })();

  window.GVPortalMeteoOffline = {
    resumen: meteoOffline.resumen
  };


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
      lat: -52.941944,
      lon: -70.828537,
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
function formatearViento(valorKmh, usarMsPrimero = false) {
  if (!Number.isFinite(valorKmh)) {
    return usarMsPrimero
      ? "-- m/s · -- km/h"
      : "-- km/h";
  }

  const kmh = `${valorKmh.toLocaleString("es-CL", {
    maximumFractionDigits: 1
  })} km/h`;

  if (!usarMsPrimero) {
    return kmh;
  }

  const valorMs = valorKmh / 3.6;

  const ms = `${valorMs.toLocaleString("es-CL", {
    maximumFractionDigits: 1
  })} m/s`;

  return `${ms} · ${kmh}`;
}


function formatearUV(valor) {
  if (!Number.isFinite(valor)) {
    return "--";
  }

  let nivel = "";

  if (valor < 3) {
    nivel = "Bajo";
  } else if (valor < 6) {
    nivel = "Moderado";
  } else if (valor < 8) {
    nivel = "Alto";
  } else if (valor < 11) {
    nivel = "Muy alto";
  } else {
    nivel = "Extremo";
  }

  const numero = valor.toLocaleString(
    "es-CL",
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }
  );

  return `${numero} · ${nivel}`;
}


async function cargarClima(id, zona) {
  if (!navigator.onLine) {
    meteoOffline.restaurar('clima', id);
    return;
  }

  const url =
    new URL(
      "https://api.open-meteo.com/v1/forecast"
    );

  url.searchParams.set(
    "latitude",
    zona.lat
  );

  url.searchParams.set(
    "longitude",
    zona.lon
  );

  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m"
  );

  url.searchParams.set(
    "daily",
    "uv_index_max"
  );

  url.searchParams.set(
    "wind_speed_unit",
    "kmh"
  );

  url.searchParams.set(
    "timezone",
    zona.timeZone
  );

  url.searchParams.set(
    "forecast_days",
    "1"
  );

  try {
    const r =
      await fetch(
        url,
        {
          cache: "no-store"
        }
      );

    if (!r.ok) {
      throw new Error(
        `HTTP ${r.status}`
      );
    }

    const data =
      await r.json();

    const actual =
      data.current || {};

    if (!navigator.onLine ||
        ![
          actual.temperature_2m,
          actual.weather_code,
          actual.wind_speed_10m,
          actual.wind_gusts_10m
        ].every(meteoOffline.valido)) {
      throw new Error('Lectura meteorologica no verificable');
    }


    const temp =
      Number(
        actual.temperature_2m
      );

    const wind =
      Number(
        actual.wind_speed_10m
      );

    const gust =
      Number(
        actual.wind_gusts_10m
      );

    const code =
      Number(
        actual.weather_code
      );

    const uvRaw =
      data.daily?.uv_index_max?.[0];

    const uvMax =
      uvRaw === null ||
      uvRaw === undefined
        ? NaN
        : Number(uvRaw);

    const tempEl =
      $(`#temp-${id}`);

    const condEl =
      $(`#condition-${id}`);

    const windEl =
      $(`#wind-${id}`);

    const gustEl =
      $(`#gust-${id}`);

    const uvEl =
      $(`#uv-${id}`);

    if (tempEl) {
      tempEl.textContent =
        Number.isFinite(temp)
          ? `${temp.toLocaleString(
              "es-CL",
              {
                maximumFractionDigits: 1
              }
            )}°C`
          : "--°C";
    }

    if (condEl) {
      condEl.textContent =
        descripcionWmo(code);
    }

    const usarMsPrimero =
      id === "punta";

    if (windEl) {
      windEl.textContent =
        formatearViento(
          wind,
          usarMsPrimero
        );
    }

    if (gustEl) {
      gustEl.textContent =
        formatearViento(
          gust,
          usarMsPrimero
        );
    }

    if (uvEl) {
      uvEl.textContent =
        formatearUV(uvMax);
    }

    meteoOffline.guardar('clima', id, actual.time);

  } catch (error) {
    console.warn(
      `Clima ${id}:`,
      error
    );

    meteoOffline.restaurar('clima', id);
  }
}
  async function actualizarClima() {

    if (!navigator.onLine) {
      meteoOffline.restaurarTodo();
      return;
    }

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

    if (!solarOffline.valido(valor)) return null;

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


  function textoFrescuraFusionSolar(datos) {

    const edadSegundos =
      numeroPortal(
        datos?.edad_dato_segundos
      );

    const actualizadoEn =
      datos?.actualizado_en
        ? new Date(datos.actualizado_en)
        : null;

    if (
      edadSegundos === null
      || !actualizadoEn
      || Number.isNaN(
        actualizadoEn.getTime()
      )
    ) {
      return `FusionSolar \u00B7 consulta ${horaConsultaPortal()}`;
    }

    let indicador = "\uD83D\uDFE2";

    if (edadSegundos > 12 * 60) {
      indicador = "\uD83D\uDD34";
    } else if (edadSegundos > 7 * 60) {
      indicador = "\uD83D\uDFE1";
    }

    const horaActualizacion =
      new Intl.DateTimeFormat(
        "es-CL",
        {
          timeZone: "America/Santiago",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }
      ).format(actualizadoEn);

    const minutos =
      Math.floor(
        edadSegundos / 60
      );

    let antiguedad;

    if (minutos < 1) {
      antiguedad = "hace menos de 1 min";
    } else if (minutos === 1) {
      antiguedad = "hace 1 min";
    } else {
      antiguedad = `hace ${minutos} min`;
    }

    return `${indicador} FusionSolar \u00B7 actualizado ${horaActualizacion} \u00B7 ${antiguedad}`;
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

  if (!solarOffline.valido(valor)) return null;

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

    if (!navigator.onLine) {
      solarOffline.restaurar(id);
      return;
    }

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

      if (!navigator.onLine || datos?.error) {
        throw new Error('SolaX no verificable');
      }

      solarOffline.normal(id);


      const inversores =
        Array.isArray(datos.inversores)
          ? datos.inversores
          : [];
      // Diagnostico Lo Aguirre: expone solo telemetria publica del inversor,
      // sin una consulta extra a SolaX ni informacion de autenticacion.
      window.__gvSolaxLoAguirreSnapshot = inversores.map(inversor => ({
        nombre: inversor.nombre,
        estado: inversor.estado,
        nivel: inversor.nivel,
        ultimo_dato: inversor.ultimo_dato,
        potencia_ac: inversor.potencia_ac,
        potencia_nominal_kw: inversor.potencia_nominal_kw
      }));
      window.dispatchEvent(new CustomEvent('gv:solax:lo-aguirre-actualizado', {
        detail: window.__gvSolaxLoAguirreSnapshot
      }));

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

      // GRIDVISION SOLAX COMPACTO V3
      // Estado conocido y dato vigente son conceptos diferentes.
      const totalInversores = inversores.length;
      const vigentes = inversores.filter(
        inversor => inversor && datoSolaxVigente(inversor)
      );
      const operativos = vigentes.filter(
        inversor => inversor.nivel === "ok"
      ).length;
      const fallasConocidas = inversores.filter(
        inversor => inversor && inversor.nivel === "falla"
      ).length;
      const fallasVigentes = vigentes.filter(
        inversor => inversor.nivel === "falla"
      ).length;
      const enEspera = vigentes.filter(
        inversor => inversor.nivel === "espera"
      ).length;
      const sinVerificar = totalInversores - vigentes.length;
      actualizarInversoresSolar(id, operativos, totalInversores);

      // GRIDVISION SOLAX DISENO V5: resumen discreto + diagnostico modal.
      const detalle = document.getElementById("solar-inverters-detail-lo-aguirre");
      if (detalle) {
        detalle.replaceChildren();
        detalle.className = "gv-solax-v5-strip";
        detalle.removeAttribute("style");

        const resumen = document.createElement("span");
        resumen.className = "gv-solax-v5-resumen";
        // GRIDVISION SOLAX - RESUMEN OPERACIONAL CLARO
        const fallasAntiguas = Math.max(
          0, fallasConocidas - fallasVigentes
        );

        let mensajeOperacional = "";

        if (totalInversores === 0) {
          mensajeOperacional = "Sin datos de inversores";
        } else if (fallasVigentes > 0) {
          mensajeOperacional =
            `${fallasVigentes} inversor(es) en falla vigente` +
            (sinVerificar > 0
              ? ` \u00B7 ${sinVerificar} sin verificar`
              : "");
        } else if (sinVerificar > 0) {
          mensajeOperacional =
            `${sinVerificar} inversor(es) sin datos recientes` +
            (fallasAntiguas > 0
              ? ` \u00B7 \u00DAltimo estado: falla en ${fallasAntiguas}`
              : "");
        } else if (enEspera > 0) {
          mensajeOperacional =
            `${enEspera} inversor(es) en espera` +
            ` \u00B7 ${operativos} operativos`;
        } else if (operativos === totalInversores) {
          mensajeOperacional = "Todos los inversores operativos";
        } else {
          mensajeOperacional =
            `${operativos}/${totalInversores} operativos` +
            " \u00B7 Revisar estados SolaX";
        }

        resumen.textContent = mensajeOperacional;
        const botonDetalle = document.createElement("button");
        botonDetalle.type = "button";
        botonDetalle.className = "gv-solax-v5-abrir";
        botonDetalle.textContent = "Ver equipos";
        botonDetalle.setAttribute("aria-haspopup", "dialog");
        botonDetalle.setAttribute("aria-controls", "gv-solax-v5-dialogo");
        detalle.append(resumen, botonDetalle);

        let dialogo = document.getElementById("gv-solax-v5-dialogo");
        if (!dialogo) {
          dialogo = document.createElement("dialog");
          dialogo.id = "gv-solax-v5-dialogo";
          dialogo.className = "gv-solax-v5-dialogo";
          dialogo.setAttribute("aria-labelledby", "gv-solax-v5-titulo");
          dialogo.innerHTML =
            '<div class="gv-solax-v5-cabecera">' +
              '<div><small>DIAGNOSTICO SOLAX CLOUD</small>' +
              '<h2 id="gv-solax-v5-titulo">PFV ICV Lo Aguirre</h2></div>' +
              '<button type="button" class="gv-solax-v5-cerrar" aria-label="Cerrar diagnostico"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="display:block;pointer-events:none"><path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>' +
            '</div>' +
            '<p class="gv-solax-v5-nota">Estado comunicado por SolaX. ' +
              'Una lectura antigua no confirma el estado actual.</p>' +
            '<div class="gv-solax-v5-indicadores" id="gv-solax-v5-indicadores"></div>' +
            '<div class="gv-solax-v5-filas" id="gv-solax-v5-filas"></div>' +
            '<div class="gv-solax-v5-pie">Vigencia: hasta 10 minutos desde la ultima lectura.</div>';
          document.body.appendChild(dialogo);
          dialogo.querySelector(".gv-solax-v5-cerrar").addEventListener("click", evento => {
            evento.stopPropagation();
            dialogo.close();
          });
          dialogo.addEventListener("click", evento => {
            if (evento.target === dialogo) dialogo.close();
          });
        }

        const indicadores = dialogo.querySelector("#gv-solax-v5-indicadores");
        indicadores.replaceChildren();
        for (const [titulo, valor, clase] of [
          ["Operativos confirmados", `${operativos}/${totalInversores}`, "ok"],
          ["Ultima falla conocida", `${fallasConocidas}/${totalInversores}`, "falla"],
          ["Datos vigentes", `${vigentes.length}/${totalInversores}`, "vigente"]
        ]) {
          const bloque = document.createElement("div");
          bloque.className = "gv-solax-v5-indicador " + clase;
          const e = document.createElement("span");
          e.textContent = titulo;
          const n = document.createElement("strong");
          n.textContent = valor;
          bloque.append(e, n);
          indicadores.appendChild(bloque);
        }

        const filas = dialogo.querySelector("#gv-solax-v5-filas");
        filas.replaceChildren();
        for (const inversor of inversores) {
          if (!inversor) continue;
          const vigente = datoSolaxVigente(inversor);
          const fila = document.createElement("div");
          fila.className = "gv-solax-v5-fila";
          const izquierda = document.createElement("div");
          izquierda.className = "gv-solax-v5-equipo";
          const nombre = document.createElement("strong");
          nombre.textContent = String(inversor.nombre || "Inversor");
          const fecha = document.createElement("small");
          fecha.textContent = inversor.ultimo_dato
            ? `Ultima lectura: ${String(inversor.ultimo_dato)}`
            : "Sin fecha de lectura";
          izquierda.append(nombre, fecha);
          const derecha = document.createElement("div");
          derecha.className = "gv-solax-v5-estados";
          const estado = document.createElement("strong");
          estado.className = "gv-solax-v5-estado " +
            (inversor.nivel === "falla" ? "falla" : inversor.nivel === "ok" ? "ok" : "espera");
          estado.textContent = String(inversor.estado || "SIN ESTADO");
          const vigencia = document.createElement("span");
          vigencia.className = "gv-solax-v5-vigencia " + (vigente ? "vigente" : "antiguo");
          vigencia.textContent = vigente ? "Dato vigente" : "Dato antiguo / no verificable";
          derecha.append(estado, vigencia);
          fila.append(izquierda, derecha);
          filas.appendChild(fila);
        }

        botonDetalle.addEventListener("click", evento => {
          evento.preventDefault();
          evento.stopPropagation();
          if (!dialogo.open) dialogo.showModal();
        });
      }
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
          ? `\u00DAltimo dato SolaX: ${ultimaFuente}`
          : `\u00DAltima consulta: ${horaConsultaPortal()}`
      );


      // Guardar solo una lectura completa y vigente.
      const lecturaCompleta =
        inversores.length === 3 &&
        vigentes.length === 3 &&
        inversores.every(i =>
          solarOffline.valido(i.potencia_ac) &&
          solarOffline.valido(i.energia_hoy) &&
          Number(i.energia_hoy) >= 0
        ) &&
        !['SIN DATOS', 'SIN COMUNICACION', 'DESCONOCIDO'].includes(estado);

      if (lecturaCompleta && ultimaFuente) {
        solarOffline.guardar(
          id,
          new Date(ultimaFuente.replace(' ', 'T')).toISOString()
        );
      } else {
        solarOffline.parcial(id);
      }

    } catch (error) {

      console.warn(
        "Portal SolaX Lo Aguirre:",
        error
      );

      solarOffline.restaurar(id);
    }
  }


  async function cargarSolarFusion(
    id,
    planta
  ) {

    if (!navigator.onLine) {
      solarOffline.restaurar(id);
      return;
    }

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

      if (!navigator.onLine || datos?.error) {
        throw new Error('FusionSolar no verificable');
      }

      solarOffline.normal(id);


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
        textoFrescuraFusionSolar(
          datos
        )
      );


      const edad = datos.edad_dato_segundos;
      const instante = Date.parse(datos.actualizado_en);

      const lecturaCompleta =
        solarOffline.valido(edad) &&
        Number(edad) >= 0 &&
        Number(edad) <= 720 &&
        Number.isFinite(instante) &&
        Date.now() - instante <= 720000 &&
        Date.now() - instante >= -120000 &&
        solarOffline.valido(datos.potencia_instantanea_kw) &&
        solarOffline.valido(datos.energia_hoy_kwh) &&
        Number(datos.energia_hoy_kwh) >= 0 &&
        inversoresFusion.length === 4 &&
        inversoresDisponibles === 4 &&
        !['SIN DATOS', 'SIN COMUNICACION', 'DESCONOCIDO'].includes(estado);

      if (lecturaCompleta) {
        solarOffline.guardar(id, new Date(instante).toISOString());
      } else {
        solarOffline.parcial(id);
      }

    } catch (error) {

      console.warn(
        `Portal FusionSolar ${planta}:`,
        error
      );

      solarOffline.restaurar(id);
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

    if (!navigator.onLine) {
      meteoOffline.restaurar('pfv', idVisual);
      return;
    }

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

      if (!navigator.onLine ||
          ![
            actual.shortwave_radiation,
            actual.temperature_2m,
            actual.cloud_cover
          ].every(meteoOffline.valido)) {
        throw new Error('Meteo PFV no verificable');
      }


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

      meteoOffline.guardar('pfv', idVisual, actual.time);

    } catch (error) {

      meteoOffline.restaurar('pfv', idVisual);

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

          // GRIDVISION SOLAX DETALLE V4: el desplegable no navega al mapa.
          tarjeta.addEventListener("click", evento => {
            if (
              tarjeta.id === "solar-lo-aguirre"
              && evento.target.closest("#solar-inverters-detail-lo-aguirre")
            ) {
              return;
            }
            abrir();
          });

          tarjeta.addEventListener(
            "keydown",
            evento => {
              // No secuestrar Enter/Espacio del control <summary>.
              if (
                tarjeta.id === "solar-lo-aguirre"
                && evento.target.closest("#solar-inverters-detail-lo-aguirre")
              ) {
                return;
              }

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

    const badge = document.getElementById('badge-senapred');

    if (!navigator.onLine) {
      alertaSenapredPrincipalPortal = null;
      gvContadoresOffline.historico('senapred', 'Sin conexion');
      return;
    }

    try {

      const r = await fetch(
        'data/alertas_senapred.json?t=' + Date.now(),
        {cache: 'no-store'}
      );

      if (!r.ok) throw Error('HTTP ' + r.status);

      const datos = await r.json();

      if (!navigator.onLine ||
          datos.fuente !== 'SENAPRED' ||
          !Array.isArray(datos.alertas)) {
        throw Error('SENAPRED no verificable');
      }

      const fuente = Date.parse(datos.generadoEn);
      const edad = Date.now() - fuente;

      if (!Number.isFinite(fuente) || edad < -120000) {
        throw Error('Fecha SENAPRED no verificable');
      }

      const vigentes = datos.alertas
        .filter(alertaSenapredVigente)
        .sort((a,b) => new Date(b.fechaHora || 0) -
                        new Date(a.fechaHora || 0));

      const guardado = gvContadoresOffline.guardar(
        'senapred', vigentes.length, fuente
      );

      if (!guardado || edad > 45 * 60000) {

        alertaSenapredPrincipalPortal = null;

        gvContadoresOffline.historico(
          'senapred', 'Archivo SENAPRED antiguo'
        );

        return;
      }

      alertaSenapredPrincipalPortal = vigentes[0] || null;

      gvContadoresOffline.limpiar('senapred');

      if (badge) {

        badge.textContent = String(vigentes.length);

        badge.title =
          'SENAPRED: ' + vigentes.length +
          ' alertas en el ultimo archivo consultado';

        badge.setAttribute('aria-label', badge.title);
      }

    } catch (error) {

      alertaSenapredPrincipalPortal = null;

      gvContadoresOffline.historico(
        'senapred', 'SENAPRED no verificable'
      );

      console.warn('Portal SENAPRED:', error);
    }
}

window.addEventListener('offline', () => {
  alertaSenapredPrincipalPortal = null;
  gvContadoresOffline.historico('senapred', 'Sin conexion');
});

window.addEventListener('online', actualizarSenapredPortal);

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

  window.addEventListener('offline', () => {
    meteoOffline.restaurarTodo();
    solarOffline.restaurarTodo();
  });

  window.addEventListener('online', () => {
    actualizarClima();
    actualizarMeteoPFV();
    actualizarMonitoreoSolar();
  });

  if (!navigator.onLine) {
    meteoOffline.restaurarTodo();
    solarOffline.restaurarTodo();
  }

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
/* =========================================================
   PORTAL - MENU MOVIL
   ========================================================= */

const botonMenuMovil =
    document.getElementById("mobile-menu-toggle");

const navegacionPortal =
    document.getElementById("portal-nav");

if (botonMenuMovil && navegacionPortal) {

    botonMenuMovil.addEventListener("click", () => {

        const abierto =
            navegacionPortal.classList.toggle("menu-abierto");

        botonMenuMovil.setAttribute(
            "aria-expanded",
            String(abierto)
        );

        const icono =
            botonMenuMovil.querySelector(".mobile-menu-icon");

        if (icono) {
            icono.textContent = abierto ? "×" : "☰";
        }

    });

}


/* GRIDVISION_SITR_BADGE_V01 - OFFLINE V2154 */

(() => {

  const badge = document.getElementById('badge-sitr');

  if (!badge) return;

  const endpoint = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? location.origin + '/api/sitr'
    : 'https://gridvision-piloto-publico.onrender.com/api/sitr';

  const INTERVALO_MS = 15 * 60 * 1000;

  function pintar(numero, estado, descripcion) {

    gvContadoresOffline.limpiar('sitr');

    badge.textContent = numero;

    badge.classList.remove(
      'sitr-badge-ok',
      'sitr-badge-error',
      'sitr-badge-unknown'
    );

    badge.classList.add('sitr-badge-' + estado);

    badge.title = descripcion;
    badge.setAttribute('aria-label', descripcion);
  }

  async function actualizarContadorSitr() {

    if (!navigator.onLine) {
      gvContadoresOffline.historico('sitr', 'Sin conexion');
      return;
    }

    const controlador = new AbortController();

    const cancelacion = setTimeout(
      () => controlador.abort(), 15000
    );

    try {

      const r = await fetch(endpoint, {
        cache: 'no-store',
        signal: controlador.signal
      });

      if (!r.ok) throw Error('HTTP ' + r.status);

      const datos = await r.json();

      if (!navigator.onLine ||
          datos.ok === false ||
          datos.error ||
          !Array.isArray(datos.instalaciones) ||
          !datos.instalaciones.length) {
        throw Error('SITR no verificable');
      }

      let total = 0;
      let incidencias = 0;

      for (const central of datos.instalaciones) {

        if (central.variables_total == null ||
            central.variables_incidentes == null ||
            String(central.variables_total).trim() === '' ||
            String(central.variables_incidentes).trim() === '') {
          throw Error('Variables SITR incompletas');
        }

        const esperado = Number(central.variables_total);
        const fallas = Number(central.variables_incidentes);

        if (!Number.isInteger(esperado) ||
            esperado <= 0 ||
            !Number.isInteger(fallas) ||
            fallas < 0 ||
            fallas > esperado) {
          throw Error('Conteo SITR incorrecto');
        }

        total += esperado;
        incidencias += fallas;
      }

      if (total !== 45) {
        throw Error('SITR parcial: ' + total + '/45');
      }

      const fuente = gvContadoresOffline.fechaCEN(
        datos.actualizado_cen ||
        datos.frescura_cen?.actualizado_cen
      );

      const edad = (Date.now() - fuente) / 60000;

      if (!Number.isFinite(edad) ||
          edad < -2 ||
          edad > 60 ||
          ['DESACTUALIZADO','DESCONOCIDA'].includes(
            datos.frescura_cen?.estado
          )) {
        throw Error('Fuente CEN antigua o desconocida');
      }

      if (!gvContadoresOffline.guardar(
        'sitr', incidencias, fuente
      )) {
        throw Error('Lectura anterior al respaldo');
      }

      if (edad > 30) {

        gvContadoresOffline.historico(
          'sitr', 'Fuente CEN con retraso'
        );

        return;
      }

      pintar(
        String(incidencias),
        incidencias > 0 ? 'error' : 'ok',
        'SITR: ' + incidencias + ' incidencias de 45 variables'
      );

    } catch (error) {

      gvContadoresOffline.historico(
        'sitr', 'Estado SITR no verificable'
      );

      console.warn('Contador SITR:', error);

    } finally {

      clearTimeout(cancelacion);
    }
  }

  actualizarContadorSitr();

  setInterval(actualizarContadorSitr, INTERVALO_MS);

  window.addEventListener('offline', () => {
    gvContadoresOffline.historico('sitr', 'Sin conexion');
  });

  window.addEventListener('online', actualizarContadorSitr);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) actualizarContadorSitr();
  });

})();
