(() => {
    "use strict";

    // Vista documental: copia manual, NO descarga ni refresco DMC en vivo.
    const RUTA_INDICE = "data/dmc/indice.json";
    const RUTA_PANEL = "components/dmc/dmc.html";
    const zonaHoraria = "America/Santiago";
    const porId = id => document.getElementById(id);
    const escapar = value => String(value ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    let avisos = [];
    let datosSenapred = null;
    let capaDmc = null;
    let capasCargadas = [];
    let capasDivisiones = [];
    const capasPorCodigo = new Map();
    const divisionesPorCodigo = new Map();
    let impactosPorAviso = new Map();
    let documentoSeleccionados = new Set();
    const nivelesVisibles = { aviso: true, alerta: true, alarma: true };
    const geometriasVisibles = new Map();
    const fichasCache = new Map();
    // v13: detalle geográfico oficial de las fichas guardado en memoria.
    const zonasResumenCache = new Map();
    const zonasPendientes = new Map();
    let fechaCopiaDmc = null;
    let focoAnterior = null;
    // Contexto de navegacion entre selector de documentos y ficha individual.
    let fichaContexto = null;

    // Simbología operacional. La severidad proviene del tipo de documento DMC,
    // nunca se infiere a partir del estado de alerta de SENAPRED.
    const SIMBOLOGIA = Object.freeze({
        aviso: { etiqueta: "Aviso", color: "#e4b700", relleno: "#fde047", opacidad: 0.17, grosor: 0.9 },
        alerta: { etiqueta: "Alerta", color: "#f97316", relleno: "#fb923c", opacidad: 0.17, grosor: 1.0 },
        alarma: { etiqueta: "Alarma", color: "#dc2626", relleno: "#f87171", opacidad: 0.20, grosor: 1.1 }
    });
    const SVG_NS = "http://www.w3.org/2000/svg";
    let achurado = true;
    let poligonoSeleccionado = null;
    let elementosGeograficos = [];
    let leyendaMapa = null;
    let contenedorLeyenda = null;

    function obtenerNivel(tipo) {
        const texto = String(tipo || "").normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
        if (texto.includes("alarma")) return "alarma";
        if (texto.includes("alerta")) return "alerta";
        return "aviso";
    }

    function estiloPoligono(nivel, destacado = false) {
        const c = SIMBOLOGIA[nivel] || SIMBOLOGIA.aviso;
        return {
            color: c.color,
            weight: c.grosor + (destacado ? 0.45 : 0),
            opacity: nivel === "aviso" ? (destacado ? 0.70 : 0.53) : (destacado ? 0.57 : 0.35),
            fillColor: c.relleno,
            // Siempre una transparencia segura, incluso si la capa carece de SVG.
            fillOpacity: Math.min(c.opacidad + (destacado ? 0.06 : 0), 0.28),
            lineCap: "round",
            lineJoin: "round"
        };
    }

    // El mapa nacional usa Canvas (preferCanvas: true). El pane DMC se dibuja
    // con un renderer SVG independiente para soportar los patrones oficiales.
    function asegurarPatron(layer, nivel, destacado) {
        const svg = layer._renderer?._container;
        const ruta = layer._path;
        if (!svg || !ruta || svg.namespaceURI !== SVG_NS) return null;
        const c = SIMBOLOGIA[nivel] || SIMBOLOGIA.aviso;
        const id = `gridvision-dmc-v5-${nivel}-${destacado ? "activo" : "normal"}`;
        let defs = svg.querySelector("defs");
        if (!defs) {
            defs = document.createElementNS(SVG_NS, "defs");
            svg.insertBefore(defs, svg.firstChild);
        }
        if (!defs.querySelector(`[id="${id}"]`)) {
            const patron = document.createElementNS(SVG_NS, "pattern");
            patron.setAttribute("id", id);
            patron.setAttribute("patternUnits", "userSpaceOnUse");
            patron.setAttribute("width", "12");
            patron.setAttribute("height", "12");
            patron.setAttribute("patternTransform", "rotate(45)");
            const fondo = document.createElementNS(SVG_NS, "rect");
            fondo.setAttribute("width", "12");
            fondo.setAttribute("height", "12");
            fondo.setAttribute("fill", c.relleno);
            fondo.setAttribute("fill-opacity", nivel === "aviso" ? (destacado ? "0.28" : "0.19") : (destacado ? "0.24" : "0.15"));
            patron.appendChild(fondo);
            const raya = document.createElementNS(SVG_NS, "path");
            raya.setAttribute("d", "M 0 0 V 12");
            raya.setAttribute("stroke", c.color);
            raya.setAttribute("stroke-opacity", nivel === "aviso" ? (destacado ? "0.65" : "0.53") : (destacado ? "0.55" : "0.40"));
            raya.setAttribute("stroke-width", nivel === "aviso" ? (destacado ? "1.45" : "1.2") : (destacado ? "1.35" : "1.15"));
            patron.appendChild(raya);
            defs.appendChild(patron);
        }
        return id;
    }

    function actualizarEstilo(layer) {
        const nivel = layer._dmcNivel || "aviso";
        const destacado = layer === poligonoSeleccionado || Boolean(layer._dmcHover);
        const estilo = estiloPoligono(nivel, destacado);
        if (layer._dmcSinContorno) { estilo.weight = 0; estilo.opacity = 0; }
        layer.setStyle(estilo);
        const ruta = layer._path;
        if (!ruta) return;
        // Leaflet aplica el relleno como atributo SVG, la regla inline prevalece.
        // Quitar el inline ANTES de restaurar el color plano evita amarillos sólidos.
        ruta.style.removeProperty("fill");
        if (!achurado) return;
        const id = asegurarPatron(layer, nivel, destacado);
        if (id) {
            ruta.style.setProperty("fill", `url(#${id})`);
            ruta.setAttribute("fill-opacity", "1");
        }
    }

    function actualizarTodosLosEstilos() {
        elementosGeograficos.forEach(actualizarEstilo);
    }

    function actualizarLeyendaMapa() {
        // v6: leyenda flotante eliminada para despejar el mapa.
        return;
    }

    function crearLeyendaMapa(mapa) {
        // v6: no se agrega control flotante DMC en la esquina inferior derecha.
        leyendaMapa = null;
        contenedorLeyenda = null;
        return;
    }

    function seleccionPoligono(layer) {
        const anterior = poligonoSeleccionado;
        poligonoSeleccionado = layer;
        if (anterior && anterior !== layer) actualizarEstilo(anterior);
        actualizarEstilo(layer);
        // Se resalta dentro de la capa meteorológica, bajo las líneas eléctricas.
        layer.bringToFront?.();
    }

    function diaChile() {
        const f = new Intl.DateTimeFormat("en-US", {
            timeZone: zonaHoraria, year: "numeric", month: "2-digit", day: "2-digit"
        }).formatToParts(new Date());
        const p = Object.fromEntries(f.map(x => [x.type, x.value]));
        return `${p.year}-${p.month}-${p.day}`;
    }

    function formatoFecha(iso) {
        if (!iso) return "No informada";
        const f = new Date(iso);
        if (Number.isNaN(f.getTime())) return "No informada";
        return new Intl.DateTimeFormat("es-CL", {
            timeZone: zonaHoraria, day: "2-digit", month: "2-digit",
            year: "numeric", hour: "2-digit", minute: "2-digit"
        }).format(f);
    }

    function documentoVisible(aviso) {
        return nivelesVisibles[obtenerNivel(aviso.tipo)] && documentoSeleccionados.has(aviso.codigo) && incluidoEnVista(aviso);
    }

    function incluidoEnVista(aviso) {
        return Boolean(porId("dmc-ver-historicos")?.checked) ||
            !aviso.fechaFinDia || aviso.fechaFinDia >= diaChile();
    }

    function actualizarHistoricos() {
        if (!capaDmc) return;
        for (const a of avisos) {
            const capa = capasPorCodigo.get(a.codigo);
            if (!capa) continue;
            if (documentoVisible(a) && !capaDmc.hasLayer(capa)) capaDmc.addLayer(capa);
            if (!documentoVisible(a) && capaDmc.hasLayer(capa)) capaDmc.removeLayer(capa);
        }
        actualizarDivisiones();
        ordenarPorSeveridad();
        actualizarConteoSeleccion();
        renderizarFiltros();
        pintarImpactos();
        armarAvisos();
        pintarComparacion();
    }

    function situacionVigencia(aviso) {
        const hoy = diaChile();
        if (aviso.fechaFinDia && hoy > aviso.fechaFinDia)
            return "Período informado finalizado: aviso histórico. Verificar si la DMC emitió otro.";
        if (aviso.fechaInicioDia && hoy < aviso.fechaInicioDia)
            return "Aviso para un período futuro; verificar actualizaciones oficiales.";
        if (aviso.fechaFinDia === hoy)
            return "Último día informado de vigencia; verificar ampliaciones/cancelaciones.";
        return "Dentro del período indicado en el documento; confirmar vigencia oficial.";
    }

    async function leerJson(ruta) {
        const respuesta = await fetch(ruta, { cache: "no-store" });
        if (!respuesta.ok) throw new Error(`${ruta}: HTTP ${respuesta.status}`);
        return respuesta.json();
    }

    function extraerVersion(codigo) {
        const m = /^(A\d+)(?:-(\d+))?\/(20\d{2})$/i.exec(codigo || "");
        return m ? { base: m[1].toUpperCase(), revision: Number(m[2] || 0), anio: m[3] } : null;
    }

    function mismoTerritorio(alerta, aviso) {
        const texto = `${alerta.regiones || ""} ${alerta.titulo || ""}`
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return (aviso.regiones || []).some(region => texto.includes(
            region.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        ));
    }

    function comparar(aviso) {
        if (!datosSenapred || !Array.isArray(datosSenapred.alertas)) {
            return { clase: "pendiente", mensaje: "Pendiente: SENAPRED no ha entregado datos para esta sesión." };
        }
        const fechaGeneracion = new Date(datosSenapred.generadoEn || "");
        if (Number.isNaN(fechaGeneracion.getTime()) ||
            Math.abs(Date.now() - fechaGeneracion.getTime()) > 72 * 3600 * 1000) {
            return { clase: "pendiente", mensaje:
                `Pendiente: respaldo SENAPRED fuera del límite de 72 h (${formatoFecha(datosSenapred.generadoEn)}).` };
        }
        const v = extraerVersion(aviso.codigo);
        if (!v) return { clase: "pendiente", mensaje: "Código DMC no reconocido." };
        const re = new RegExp(`\\b${v.base}(?:-(\\d+))?(?:\\/${v.anio})?\\b`, "ig");
        const alertas = datosSenapred.alertas.filter(a =>
            a.isActive !== false && a.isDeleted !== true &&
            !["CANCELADA", "HISTORICA"].includes(a.estadoVigencia) &&
            mismoTerritorio(a, aviso)
        );
        if (!alertas.length) {
            return { clase: "pendiente", mensaje: "Sin boletines vigentes del territorio en los datos consultados; revisar SENAPRED." };
        }
        const citas = [];
        for (const a of alertas) {
            const texto = `${a.titulo || ""} ${a.contenido || ""}`;
            for (const m of texto.matchAll(re)) citas.push({ revision: Number(m[1] || 0), fecha: a.fechaHora });
        }
        if (!citas.length) {
            return { clase: "pendiente", mensaje:
                `${v.base} no fue encontrado en los boletines regionales recibidos. No significa ausencia de alerta SENAPRED.` };
        }
        const mayor = Math.max(...citas.map(c => c.revision));
        if (mayor === v.revision) {
            return { clase: "coincide", mensaje: `El boletín SENAPRED disponible cita la versión ${aviso.codigo}.` };
        }
        if (mayor < v.revision) {
            return { clase: "diferencia", mensaje:
                `En los boletines comparados se cita ${v.base}${mayor ? `-${mayor}` : ""}, pero la copia DMC es ${aviso.codigo}. Confirmar en fuentes oficiales.` };
        }
        return { clase: "pendiente", mensaje:
            `SENAPRED cita una revisión posterior (${v.base}-${mayor}). Actualizar el GeoJSON DMC local.` };
    }

    function pintarComparacion() {
        const destino = porId("dmc-comparacion");
        if (!destino) return;
        destino.innerHTML = avisos.filter(a => documentoVisible(a)).map(a => {
            const r = comparar(a);
            return `<p><strong>${escapar(a.codigo)}</strong>: ` +
                `<span class="dmc-${r.clase}">${escapar(r.mensaje)}</span></p>`;
        }).join("") || "No hay avisos DMC cargados.";
    }

    function armarAvisos() {
        const destino = porId("dmc-lista");
        if (!destino) return;
        destino.innerHTML = avisos.filter(a => documentoVisible(a)).map(a => `
          <article class="dmc-tarjeta">
            <strong>${escapar(a.tipo)} ${escapar(a.codigo)}</strong>
            <div>${escapar(a.titulo)}</div>
            <small>Emisión documental: ${escapar(formatoFecha(a.fechaEmision))}</small>
            <small>Desde: ${escapar(a.desdeTexto)}</small>
            <small>Hasta: ${escapar(a.hastaTexto)}</small>
            <small>Zonas cartografiadas: ${Number(a.numeroPoligonos) || "—"};
              regiones: ${escapar((a.regiones || []).join(", "))}</small>
            <p class="dmc-estados">${escapar(situacionVigencia(a))}</p>
          </article>`).join("");
    }

    // ---------- DMC v13: identificación territorial en la lista ----------
    function normalizarBusqueda(valor) {
        return String(valor || "").normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }

    function regionesAviso(a) {
        return Array.isArray(a.regiones) ? a.regiones.filter(Boolean) : [];
    }

    function resumenTerritorio(a) {
        const regiones = regionesAviso(a);
        return regiones.length ? regiones.join(" · ") : "Territorio sin región indicada en el índice";
    }

    function filtrarPorLista(a) {
        const region = porId("dmc-region-lista-v13")?.value || "";
        if (region && !regionesAviso(a).includes(region)) return false;
        const q = normalizarBusqueda(porId("dmc-buscar-lista-v13")?.value);
        if (!q) return true;
        const campo = [a.codigo, a.tipo, a.titulo, a.fenomeno,
            resumenTerritorio(a), zonasResumenCache.get(a.codigo) || ""].join(" ");
        return normalizarBusqueda(campo).includes(q);
    }

    function documentosDisponibles() {
        // Sigue siendo la selección por severidad que gobierna el mapa.
        return avisos.filter(a => nivelesVisibles[obtenerNivel(a.tipo)] && incluidoEnVista(a));
    }

    function documentosEnLista() {
        // Los filtros de región y búsqueda acotan SOLO la lista, no los polígonos.
        return documentosDisponibles().filter(filtrarPorLista);
    }

    function cargarOpcionesRegiones() {
        const selector = porId("dmc-region-lista-v13");
        if (!selector) return;
        const actual = selector.value;
        const regiones = [...new Set(avisos.flatMap(regionesAviso))].sort((a,b) => a.localeCompare(b,"es"));
        selector.replaceChildren();
        const opcion = document.createElement("option");
        opcion.value = "";
        opcion.textContent = "Todas las regiones";
        selector.append(opcion);
        for (const r of regiones) {
            const opt = document.createElement("option");
            opt.value = r;
            opt.textContent = r;
            selector.append(opt);
        }
        selector.value = regiones.includes(actual) ? actual : "";
    }

    function actualizarConteoSeleccion() {
        const disponibles = documentosDisponibles();
        const visibles = disponibles.filter(a => documentoSeleccionados.has(a.codigo)).length;
        const destino = porId("dmc-documentos-visibles-v9");
        if (destino) destino.textContent = String(visibles);
        const total = porId("dmc-documentos-disponibles-v10");
        if (total) total.textContent = String(disponibles.length);
        const resumen = porId("dmc-resumen-corto-v10");
        if (resumen) resumen.textContent = `${visibles} seleccionados de ${avisos.length} documentos · ` +
            (fechaCopiaDmc ? `DMC: ${formatoFecha(fechaCopiaDmc)}` : "copia local sin fecha");
        const coincidencias = porId("dmc-coincidencias-v13");
        if (coincidencias) coincidencias.textContent =
            `${documentosEnLista().length} de ${disponibles.length} documentos en la lista`;
    }

    // Se reutiliza el archivo de ficha que ya descargó la sincronización v9.
    // No inventar zonas a partir de un título o de un punto del mapa.
    function cargarZonasTarjeta(a, zonaNode) {
        const codigo = a.codigo;
        const actualizar = valor => {
            if (!zonaNode.isConnected) return;
            zonaNode.textContent = valor ? `Zonas: ${valor}` : "Zonas: consultar ficha";
            zonaNode.title = valor || "El documento no incluye un detalle de zonas";
        };
        if (zonasResumenCache.has(codigo)) {
            actualizar(zonasResumenCache.get(codigo));
            return;
        }
        if (!zonasPendientes.has(codigo)) {
            const promesa = leerFicha(a)
                .then(ficha => {
                    const texto = String(ficha?.textoZonaAfecta || "").trim()
                        .replace(/\s*\n\s*/g," · ");
                    zonasResumenCache.set(codigo, texto);
                    return texto;
                })
                .catch(() => {
                    zonasResumenCache.set(codigo, "");
                    return "";
                })
                .finally(() => zonasPendientes.delete(codigo));
            zonasPendientes.set(codigo, promesa);
        }
        zonasPendientes.get(codigo).then(valor => {
            actualizar(valor);
            // Si había búsqueda por zona pendiente, reconsiderar las coincidencias.
            if (porId("dmc-buscar-lista-v13")?.value?.trim()) renderizarFiltros();
        });
    }

    function renderizarFiltros() {
        const niveles = { aviso: 0, alerta: 0, alarma: 0 };
        avisos.forEach(a => niveles[obtenerNivel(a.tipo)]++);
        for (const [nivel, id] of Object.entries({ aviso:"dmc-n-avisos", alerta:"dmc-n-alertas", alarma:"dmc-n-alarmas" })) {
            const el = porId(id);
            if (el) el.textContent = String(niveles[nivel]);
            const checkbox = porId("dmc-severidades-v9")?.querySelector(`input[data-dmc-nivel="${nivel}"]`);
            if (checkbox) {
                checkbox.checked = nivelesVisibles[nivel];
                checkbox.disabled = niveles[nivel] === 0;
            }
        }
        const lista = porId("dmc-documentos-lista-v9");
        if (!lista) return;
        // Conservar el desplazamiento cuando cambia una selección.
        const desplazamiento = lista.scrollTop;
        lista.replaceChildren();
        const disponibles = documentosEnLista();
        if (!disponibles.length) {
            lista.append(crearTexto("p", "No hay documentos que coincidan con el filtro de nivel, región o búsqueda.", "dmc-lista-vacia-v10"));
        }
        for (const a of disponibles) {
            const nivel = obtenerNivel(a.tipo);
            const item = document.createElement("div");
            item.className = "dmc-doc-v9 dmc-doc-v13";
            item.style.setProperty("--dmc-c", SIMBOLOGIA[nivel].color);
            item.dataset.disabled = documentoSeleccionados.has(a.codigo) ? "false" : "true";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = documentoSeleccionados.has(a.codigo);
            checkbox.setAttribute("aria-label", `Mostrar cobertura ${a.codigo} · ${resumenTerritorio(a)}`);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) documentoSeleccionados.add(a.codigo);
                else documentoSeleccionados.delete(a.codigo);
                actualizarHistoricos();
            });
            const contenido = document.createElement("div");
            contenido.className = "dmc-doc-info-v13";
            const titulo = crearTexto("strong", `${a.codigo} · ${a.tipo}`);
            const descripcion = crearTexto("span", a.fenomeno || a.titulo || "Documento meteorológico", "dmc-doc-fenomeno-v13");
            const region = crearTexto("span", `Regiones: ${resumenTerritorio(a)}`, "dmc-doc-region-v13");
            region.title = resumenTerritorio(a);
            const zonas = crearTexto("small", "Zonas: consultando detalle…", "dmc-doc-zonas-v13");
            // Una línea de vigencia ayuda a diferenciar avisos parecidos.
            const periodo = a.fechaFinDia ? `Hasta ${a.fechaFinDia.split("-").reverse().join("/")}` : "Vigencia: ver ficha";
            const fecha = crearTexto("small", periodo, "dmc-doc-fecha-v13");
            const acciones = document.createElement("div");
            acciones.className = "dmc-doc-botones-v9";
            const solo = document.createElement("button");
            solo.type = "button";
            solo.textContent = "Solo este";
            solo.title = "Mostrar únicamente este documento y acercar su área en el mapa";
            solo.addEventListener("click", () => {
                documentoSeleccionados = new Set([a.codigo]);
                for (const n of Object.keys(nivelesVisibles)) nivelesVisibles[n] = (n === nivel);
                const capaInput = porId("dmc-capa");
                if (capaInput) capaInput.checked = true;
                cambiarVisibilidad();
                const capa = capasPorCodigo.get(a.codigo);
                if (capa && window.GridVisionMapa && capa.getBounds()?.isValid()) {
                    window.GridVisionMapa.fitBounds(capa.getBounds(), {padding:[40,40]});
                }
            });
            const ficha = document.createElement("button");
            ficha.type = "button";
            ficha.textContent = "Ver ficha";
            ficha.addEventListener("click", () => abrirFichaDocumento(a));
            acciones.append(solo, ficha);
            contenido.append(titulo, descripcion, region, zonas, fecha, acciones);
            item.append(checkbox, contenido);
            lista.append(item);
            cargarZonasTarjeta(a, zonas);
        }
        lista.scrollTop = desplazamiento;
        actualizarConteoSeleccion();
    }

    function ordenarPorSeveridad() {
        // SVG conserva el orden de dibujo en el pane DMC: aviso < alerta < alarma.
        const prioridad = { aviso:0, alerta:1, alarma:2 };
        [...avisos].sort((a,b) => prioridad[obtenerNivel(a.tipo)] - prioridad[obtenerNivel(b.tipo)])
          .forEach(a => {
              const capa = capasPorCodigo.get(a.codigo);
              if (capa && capaDmc?.hasLayer(capa)) capa.eachLayer(l => l.bringToFront?.());
          });
    }

    // ---------- DMC v9: geometría y superposición ----------
    function dentroAnillo(lon, lat, anillo) {
        let dentro = false;
        for (let i=0,j=anillo.length-1; i<anillo.length; j=i++) {
            const a = anillo[i], b = anillo[j];
            if (((a[1]>lat)!==(b[1]>lat)) &&
                (lon < (b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0])) dentro = !dentro;
        }
        return dentro;
    }
    function dentroGeometria(lon,lat,geom) {
        if (!geom) return false;
        const poligonos = geom.type === "Polygon" ? [geom.coordinates] :
                          geom.type === "MultiPolygon" ? geom.coordinates : [];
        return poligonos.some(rings => Array.isArray(rings) && rings.length &&
            dentroAnillo(lon,lat,rings[0]) && !rings.slice(1).some(r => dentroAnillo(lon,lat,r)));
    }
    function documentosEnPunto(latlng) {
        return avisos.filter(a => {
            if (!documentoVisible(a)) return false;
            return (geometriasVisibles.get(a.codigo) || []).some(g => dentroGeometria(latlng.lng,latlng.lat,g));
        }).sort((a,b) => ({alarma:0,alerta:1,aviso:2})[obtenerNivel(a.tipo)] -
                      ({alarma:0,alerta:1,aviso:2})[obtenerNivel(b.tipo)]);
    }
    function clickCobertura(evt) {
        if (!capaDmc || !window.GridVisionMapa?.hasLayer(capaDmc)) return false;
        const encontrados = documentosEnPunto(evt.latlng);
        if (!encontrados.length) return false;
        // Evitar que Leaflet abra un popup en lugar de la ficha del documento.
        if (evt.originalEvent) L.DomEvent.stopPropagation(evt.originalEvent);
        if (encontrados.length === 1) abrirFichaDocumento(encontrados[0]);
        else elegirFicha(encontrados);
        return true;
    }

    // ---------- DMC v9: ficha accesible, tablas oficiales normalizadas ----------
    function crearTexto(tag, texto, clase) {
        const el = document.createElement(tag);
        if (clase) el.className = clase;
        el.textContent = String(texto ?? "");
        return el;
    }
    function elementoFicha() { return porId("dmc-ficha-v9"); }
    function actualizarBotonesFicha() {
        const volver = Boolean(fichaContexto?.volverDocs?.length);
        const label = volver ? "Volver" : "Cerrar";
        const titulo = volver ? "Volver al selector de documentos" : "Cerrar ficha DMC";
        const btnSup = porId("dmc-ficha-cerrar-v9");
        const btnPie = porId("dmc-ficha-cerrar-pie-v9");
        if (btnSup) {
            btnSup.setAttribute("aria-label", titulo);
            btnSup.setAttribute("title", titulo);
            btnSup.textContent = volver ? "←" : "×";
        }
        if (btnPie) btnPie.textContent = volver ? "← Volver a documentos" : label;
    }
    function mostrarFicha(titulo, nivel) {
        const fondo = elementoFicha();
        if (!fondo) return null;
        if (fondo.hidden) focoAnterior = document.activeElement;
        fondo.dataset.nivel = nivel;
        porId("dmc-ficha-titulo-v9").textContent = titulo;
        const contenido = porId("dmc-ficha-contenido-v9");
        contenido.replaceChildren();
        contenido.scrollTop = 0;
        fondo.hidden = false;
        actualizarBotonesFicha();
        porId("dmc-ficha-cerrar-v9")?.focus();
        return contenido;
    }
    function cerrarFicha() {
        const volverDocs = fichaContexto?.volverDocs;
        if (volverDocs?.length) {
            fichaContexto = null;
            elegirFicha(volverDocs);
            return;
        }
        const fondo = elementoFicha();
        if (!fondo) return;
        fondo.hidden = true;
        porId("dmc-ficha-contenido-v9")?.replaceChildren();
        fichaContexto = null;
        actualizarBotonesFicha();
        focoAnterior?.focus?.();
    }
    function elegirFicha(encontrados) {
        fichaContexto = { modo: "selector", encontrados: [...encontrados], volverDocs: null };
        const cont = mostrarFicha(`${encontrados.length} documentos en esta zona`, "aviso");
        if (!cont) return;
        cont.append(crearTexto("p", "La ubicación está cubierta por varios documentos DMC. Selecciona cuál deseas consultar."));
        const lista = document.createElement("div");
        lista.className = "dmc-ficha-elegir-v9";
        encontrados.forEach(a => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.style.setProperty("--dmc-c", SIMBOLOGIA[obtenerNivel(a.tipo)].color);
            btn.textContent = `${a.tipo} ${a.codigo} · ${a.fenomeno || a.titulo}`;
            btn.addEventListener("click", () => abrirFichaDocumento(a, { volverDocs: encontrados }));
            lista.append(btn);
        });
        cont.append(lista);
    }
    async function leerFicha(a) {
        if (fichasCache.has(a.codigo)) return fichasCache.get(a.codigo);
        if (!a.archivoDocumento) return null;
        const dato = await leerJson(a.archivoDocumento);
        if (dato.codigo !== a.codigo) throw new Error("Ficha no coincide con documento consultado");
        fichasCache.set(a.codigo, dato);
        return dato;
    }
    async function abrirFichaDocumento(a, opciones = {}) {
        fichaContexto = { modo: "detalle", documento: a, volverDocs: opciones.volverDocs || null };
        const contenido = mostrarFicha(`${a.tipo} ${a.codigo}`, obtenerNivel(a.tipo));
        if (!contenido) return;
        contenido.append(crearTexto("p", "Cargando detalle documental…"));
        let ficha;
        try { ficha = await leerFicha(a); }
        catch (err) { console.warn("DMC: no fue posible cargar ficha",err); }
        if (elementoFicha()?.hidden || porId("dmc-ficha-titulo-v9")?.textContent !== `${a.tipo} ${a.codigo}`) return;
        contenido.replaceChildren();
        contenido.append(crearTexto("div", `${a.tipo.toUpperCase()} METEOROLÓGICO`, "dmc-ficha-tipo-v9"));
        contenido.append(crearTexto("h3", ficha?.titulo || a.titulo));
        const metadatos = document.createElement("div");
        metadatos.className = "dmc-ficha-metadatos-v9";
        for (const [titulo,valor] of [
            ["Código",a.codigo], ["Emisión",ficha?.emisionTexto || formatoFecha(a.fechaEmision)],
            ["Condición sinóptica",ficha?.condicionSinoptica || "No informada"],
            ["Desde",ficha?.desde || a.desdeTexto], ["Hasta",ficha?.hasta || a.hastaTexto],
            ["Zonas afectadas",ficha?.textoZonaAfecta || (a.regiones||[]).join(", ")],
            ["Observación",ficha?.observacion || ""]
        ]) {
            if (!valor) continue;
            const div=document.createElement("div");
            div.append(crearTexto("strong",titulo+": "), crearTexto("span",valor,titulo==="Zonas afectadas"?"dmc-ficha-zonas-v9":""));
            metadatos.append(div);
        }
        contenido.append(metadatos);
        if (ficha?.tablaFilas?.length) {
            contenido.append(crearTexto("h3", ficha.tablaTitulo || "Detalle por zona y período"));
            const marco=document.createElement("div");
            marco.className = "dmc-ficha-tabla-scroll-v9";
            const tabla=document.createElement("table");
            tabla.className = "dmc-ficha-tabla-v9";
            for (const fila of ficha.tablaFilas) {
                const tr = document.createElement("tr");
                for (const celda of fila) {
                    const td = document.createElement(celda.encabezado ? "th" : "td");
                    const col = Math.max(1,Math.min(20,Number(celda.colspan)||1));
                    if (col>1) td.colSpan=col;
                    td.textContent = celda.texto || "—";
                    tr.append(td);
                }
                tabla.append(tr);
            }
            marco.append(tabla);
            contenido.append(marco);
        } else {
            contenido.append(crearTexto("p", ficha ? "La DMC no publicó tabla para este documento." :
                "Detalle tabular aún no disponible. Ejecute el sincronizador actualizado v9 con --aplicar para incorporar las fichas oficiales."));
        }
        contenido.append(crearTexto("small","Copia local de información DMC. Consulte la fuente para confirmar cambios o cancelaciones."));
    }

    function pintarImpactos() {
        const destino = porId("dmc-impactos-contenido");
        if (!destino) return;
        const texto = (porId("dmc-buscar-impactos")?.value || "").trim()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const tipo = porId("dmc-tipo-impacto")?.value || "lineas";
        destino.innerHTML = avisos.filter(a => documentoVisible(a)).map(a => {
            const datos = impactosPorAviso.get(a.codigo);
            if (!datos) return `<p>${escapar(a.codigo)}: sin análisis de intersecciones.</p>`;
            const t = datos.totales || {};
            const listas = datos.elementos || {};
            const todos = tipo === "todos"
                ? [...(listas.lineas || []), ...(listas.activos || []), ...(listas.netbilling || [])]
                : (listas[tipo] || []);
            const coinciden = todos.filter(x =>
                `${x.id} ${x.nombre} ${(x.zonas || []).join(" ")}`
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(texto));
            const seleccion = coinciden.slice(0, 150);
            const listaHtml = seleccion.map(x => {
                const link = x.id ? `<a href="?activo=${encodeURIComponent(x.id)}" title="Abrir en mapa GridVision">${escapar(x.nombre)}</a>`
                                  : escapar(x.nombre);
                return `<li>${link}<small> ${escapar((x.zonas || []).join(", "))}</small></li>`;
            }).join("");
            return `<div class="dmc-tarjeta">
                <strong>${escapar(a.codigo)}</strong>
                <p>${t.activos ?? "—"} activos puntuales · ${t.lineas ?? "—"} líneas ·
                   ${t.netbilling ?? "—"} netbilling</p>
                <details ${texto ? "open" : ""}>
                  <summary>Ver ${coinciden.length} coincidencias ${coinciden.length > 150 ? "(se muestran las primeras 150)" : ""}</summary>
                  <ul>${listaHtml || "<li>No se encontraron coincidencias.</li>"}</ul>
                </details>
              </div>`;
        }).join("");
    }

    async function iniciarCapa() {
        const mapa = window.GridVisionMapa;
        if (!mapa || typeof L === "undefined") throw new Error("Mapa Leaflet no disponible");
        if (!mapa.getPane("dmcAvisos")) {
            mapa.createPane("dmcAvisos");
            // Detrás de los trazados eléctricos (overlayPane: 400).
            mapa.getPane("dmcAvisos").style.zIndex = "345";
        }
        // Canvas permanece activo para la red eléctrica, SOLO DMC utiliza SVG.
        const rendererDmc = L.svg({ pane: "dmcAvisos", padding: 0.5 });
        capaDmc = L.featureGroup();
        crearLeyendaMapa(mapa);
        // Respaldo para clics sobre zona bajo otros overlays del sistema eléctrico:
        // el mapa recibe el clic aunque el SVG meteorológico esté detrás.
        mapa.on("click", evt => {
            if (elementoFicha() && !elementoFicha().hidden) return;
            clickCobertura(evt);
        });
        // Dibujar amarillo, luego naranjo y rojo. No infiere severidad SENAPRED.
        const prioridad = { aviso: 0, alerta: 1, alarma: 2 };
        const orden = [...avisos].sort((a,b) => prioridad[obtenerNivel(a.tipo)] - prioridad[obtenerNivel(b.tipo)]);
        for (const a of orden) {
            // Geometrías originales intactas: una o varias zonas por documento.
            const geoZonas = await leerJson(a.archivoGeojson);
            if (geoZonas.type !== "FeatureCollection") throw new Error("GeoJSON de zonas inválido");
            // Geometría visual unificada: elimina SOLAMENTE divisiones internas.
            // En futuros avisos sin cobertura preparada, se dibujan las zonas sin borde.
            const unificada = Boolean(a.archivoCobertura);
            const geoVista = unificada ? await leerJson(a.archivoCobertura) : geoZonas;
            if (geoVista.type !== "FeatureCollection") throw new Error("GeoJSON de cobertura inválido");
            const capa = L.geoJSON(geoVista, {
                pane: "dmcAvisos",
                renderer: rendererDmc,
                style: f => {
                    const st = estiloPoligono(obtenerNivel(f?.properties?.tipo || a.tipo));
                    // Si no existe cobertura unificada, ocultar líneas interiores.
                    if (!unificada) { st.weight = 0; st.opacity = 0; }
                    return st;
                },
                onEachFeature: (f, l) => {
                    const p = f.properties || {};
                    const nivel = obtenerNivel(p.tipo || a.tipo);
                    const c = SIMBOLOGIA[nivel];
                    l._dmcNivel = nivel;
                    l._dmcSinContorno = !unificada;
                    elementosGeograficos.push(l);
                    const texto = unificada
                        ? `Cobertura consolidada: ${a.numeroPoligonos || 0} zonas`
                        : String(p.indice || "Zona DMC").replaceAll("_", " ");
                    l.bindTooltip(`${escapar(c.etiqueta)} ${escapar(p.codigoMeteo || a.codigo)} · ${escapar(texto)}`, {
                        sticky: true, direction: "top", className: "dmc-tooltip"
                    });
                    // Sin popup Leaflet: clic abre la ficha documental DMC.
                    l.on("mouseover", () => { l._dmcHover = true; actualizarEstilo(l); });
                    l.on("mouseout", () => { l._dmcHover = false; actualizarEstilo(l); });
                    l.on("click", evt => { seleccionPoligono(l); clickCobertura(evt); });
                    l.on("add", () => actualizarEstilo(l));
                }
            });
            geometriasVisibles.set(a.codigo, (geoVista.features || []).map(f => f.geometry));
            capaDmc.addLayer(capa);
            capasPorCodigo.set(a.codigo, capa);
            capasCargadas.push(capa);
            if (unificada) {
                // Solo para inspección: trazar límites de zonas con trazo tenue.
                // No tienen relleno y no interceptan clics sobre las líneas.
                const divisiones = L.geoJSON(geoZonas, {
                    pane: "dmcAvisos",
                    renderer: rendererDmc,
                    interactive: false,
                    style: f => ({
                        color: (SIMBOLOGIA[obtenerNivel(f?.properties?.tipo || a.tipo)] || SIMBOLOGIA.aviso).color,
                        weight: 0.75, opacity: 0.48, fill: false,
                        interactive: false
                    })
                });
                capasDivisiones.push(divisiones);
                divisionesPorCodigo.set(a.codigo, divisiones);
            }
            impactosPorAviso.set(a.codigo, await leerJson(a.archivoImpactos));
        }
        pintarImpactos();
        cambiarVisibilidad();
    }

    function actualizarDivisiones() {
        if (!capaDmc) return;
        const mostrar = Boolean(porId("dmc-divisiones")?.checked);
        for (const a of avisos) {
            const division = divisionesPorCodigo.get(a.codigo);
            if (!division) continue;
            const visible = mostrar && documentoVisible(a);
            if (visible && !capaDmc.hasLayer(division)) capaDmc.addLayer(division);
            if (!visible && capaDmc.hasLayer(division)) capaDmc.removeLayer(division);
        }
    }

    function cambiarVisibilidad() {
        const mapa = window.GridVisionMapa;
        if (!mapa || !capaDmc) return;
        const activada = porId("dmc-capa")?.checked || false;
        if (activada && !mapa.hasLayer(capaDmc)) capaDmc.addTo(mapa);
        else if (!activada && mapa.hasLayer(capaDmc)) mapa.removeLayer(capaDmc);
        actualizarHistoricos();
        if (activada) actualizarTodosLosEstilos();
        actualizarLeyendaMapa();
    }

    function cerrar() {
        const p = porId("panel-dmc");
        if (p) p.hidden = true;
        porId("abrir-dmc")?.setAttribute("aria-expanded", "false");
        actualizarLeyendaMapa();
    }

    function abrir() {
        window.GridVisionSenapred?.cerrarPanel?.();
        const p = porId("panel-dmc");
        if (p) p.hidden = false;
        porId("abrir-dmc")?.setAttribute("aria-expanded", "true");
        actualizarLeyendaMapa();
    }

    async function iniciar() {
        const contenedor = porId("contenedor-avisos-dmc");
        if (!contenedor) return;
        try {
            const res = await fetch(RUTA_PANEL, { cache: "no-store" });
            if (!res.ok) throw new Error(`Panel DMC: ${res.status}`);
            contenedor.innerHTML = await res.text();
            porId("abrir-dmc")?.addEventListener("click", () =>
                porId("panel-dmc")?.hidden ? abrir() : cerrar());
            porId("cerrar-dmc")?.addEventListener("click", cerrar);
            porId("abrir-senapred")?.addEventListener("click", cerrar);
            porId("dmc-capa")?.addEventListener("change", cambiarVisibilidad);
            porId("dmc-achurado")?.addEventListener("change", event => {
                achurado = event.target.checked;
                actualizarTodosLosEstilos();
            });
            porId("dmc-divisiones")?.addEventListener("change", actualizarDivisiones);
            porId("dmc-ver-historicos")?.addEventListener("change", () => {
                actualizarHistoricos();
                actualizarTodosLosEstilos();
            });
            porId("dmc-buscar-impactos")?.addEventListener("input", pintarImpactos);
            porId("dmc-tipo-impacto")?.addEventListener("change", pintarImpactos);
            porId("dmc-severidades-v9")?.addEventListener("change", evt => {
                const nivel = evt.target?.dataset?.dmcNivel;
                if (!Object.hasOwn(nivelesVisibles,nivel)) return;
                nivelesVisibles[nivel] = evt.target.checked;
                // Mostrar de inmediato la lista ya filtrada por esta categoría.
                const detalle = porId("dmc-documentos-v9");
                if (detalle) detalle.open = true;
                actualizarHistoricos();
            });
            porId("dmc-buscar-lista-v13")?.addEventListener("input", renderizarFiltros);
            porId("dmc-region-lista-v13")?.addEventListener("change", renderizarFiltros);
            porId("dmc-todos-v9")?.addEventListener("click", () => {
                // Actúa solo sobre las categorías visibles, no sobre todo el catálogo.
                documentosDisponibles().forEach(a => documentoSeleccionados.add(a.codigo));
                actualizarHistoricos();
            });
            porId("dmc-ninguno-v9")?.addEventListener("click", () => {
                documentosDisponibles().forEach(a => documentoSeleccionados.delete(a.codigo));
                actualizarHistoricos();
            });
            porId("dmc-ficha-cerrar-v9")?.addEventListener("click", cerrarFicha);
            porId("dmc-ficha-cerrar-pie-v9")?.addEventListener("click", cerrarFicha);
            elementoFicha()?.addEventListener("click", evt => { if (evt.target === elementoFicha()) cerrarFicha(); });
            document.addEventListener("keydown", evt => {
                if (evt.key === "Escape" && !elementoFicha()?.hidden) cerrarFicha();
                // Mantener foco en la ventana mientras está abierta.
                if (evt.key !== "Tab" || elementoFicha()?.hidden) return;
                const focusables = [...elementoFicha().querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')];
                if (!focusables.length) return;
                const first=focusables[0], last=focusables[focusables.length-1];
                if (evt.shiftKey && document.activeElement===first) {evt.preventDefault();last.focus();}
                else if (!evt.shiftKey && document.activeElement===last) {evt.preventDefault();first.focus();}
            });
            porId("dmc-enfocar")?.addEventListener("click", () => {
                if (!capaDmc || !capasCargadas.length) return;
                porId("dmc-capa").checked = true;
                cambiarVisibilidad();
                const limites = capaDmc.getBounds();
                if (!limites.isValid()) {
                    alert("No hay áreas en el período mostrado. Active 'Mostrar documentos históricos' si necesita consultar avisos anteriores.");
                    return;
                }
                window.GridVisionMapa.fitBounds(limites, { padding: [20, 20] });
                cerrar();
            });
            datosSenapred = window.GridVisionSenapred?.obtenerUltimosDatos?.() || null;
            window.addEventListener("gridvision:senapred-datos", evt => {
                datosSenapred = evt.detail;
                pintarComparacion();
            });
            const indice = await leerJson(RUTA_INDICE);
            if (indice.fuente !== "DMC" || !Array.isArray(indice.avisos)) throw new Error("Índice DMC inválido");
            avisos = indice.avisos;
            fechaCopiaDmc = indice.generadoEn || null;
            documentoSeleccionados = new Set(avisos.map(a=>a.codigo));
            cargarOpcionesRegiones();
            renderizarFiltros();
            porId("dmc-contador-header").textContent = `(${avisos.length})`;
            const niveles = { aviso: 0, alerta: 0, alarma: 0 };
            for (const a of avisos) niveles[obtenerNivel(a.tipo)]++;
            const recientes = avisos.filter(a => incluidoEnVista(a)).length;
            const alcance = indice.alcanceCatalogo === "DECLARADO_COMPLETO"
                ? "Catálogo declarado completo por el importador; confirmar contra la web DMC."
                : "Catálogo PARCIAL: no demuestra que éstos sean todos los avisos del país.";
            porId("dmc-modo").textContent =
                `DATOS LOCALES, NO EN VIVO · ${avisos.length} documentos en el índice ` +
                `(${recientes} visibles para el período actual). Importados: ${formatoFecha(indice.generadoEn)}. ` +
                alcance;
            const resumen = porId("dmc-nacional-resumen");
            if (resumen) resumen.textContent =
                `Documentos importados: Avisos ${niveles.aviso} · ` +
                `Alertas ${niveles.alerta} · Alarmas ${niveles.alarma}. ` +
                `Las zonas no cargadas no equivalen a ausencia de alertamientos.`;
            armarAvisos(); pintarComparacion();
            await iniciarCapa();
        } catch (error) {
            console.error("DMC: no fue posible cargar el módulo", error);
            if (porId("dmc-modo")) porId("dmc-modo").textContent =
                `No fue posible cargar los datos DMC: ${error.message}. Compruebe archivos/servidor.`;
            porId("dmc-contador-header") && (porId("dmc-contador-header").textContent = "(!)");
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();
