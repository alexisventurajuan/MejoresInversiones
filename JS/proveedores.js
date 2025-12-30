import {
  getArticuloById,
  addProveedor,
  updateProveedor,
  listProveedoresActivos,
  getProveedorById,
  retirarProveedor,
  upsertFlujos,
  listFlujosByProveedor
} from "./db.js";

import {
  buildCashflowsFromVentasCostos,
  calcPayback,
  paybackToYMD,
  npv,
  irr
} from "./finance.js";

import {
  toNumber,
  money,
  normalizePct,
  pct,
  $,
  alertAndReturn
} from "./utilidades.js";

/* -------------------- State -------------------- */
let articulo = null;
let selectedProveedorId = null;
let currentFlujos = []; // [{anio, ventas, costos}]

/* -------------------- DOM refs -------------------- */
// Contexto
const ctxEmpresa = $("ctxEmpresa");
const ctxArticuloNombre = $("ctxArticuloNombre");
const ctxFechaCalculo = $("ctxFechaCalculo");
const ctxImpuestos = $("ctxImpuestos");
const ctxWacc = $("ctxWacc");
const ctxVidaUtil = $("ctxVidaUtil");
const ctxInvArticulo = $("ctxInvArticulo");
const ctxVrArticulo = $("ctxVrArticulo");

// Form proveedor
const proveedorNombre = $("proveedorNombre");
const productoNombre = $("productoNombre");
const invProveedor = $("invProveedor");
const gastosProveedor = $("gastosProveedor");
const vidaUtilProveedor = $("vidaUtilProveedor");
const vrProveedor = $("vrProveedor");
const pagoEquipo = $("pagoEquipo");

const btnLimpiarProveedor = $("btnLimpiarProveedor");
const btnSiguienteFlujos = $("btnSiguienteFlujos");
const btnGuardarProveedor = $("btnGuardarProveedor");
const btnDetalleFlujos = $("btnDetalleFlujos");
const btnCalcular = $("btnCalcular");

const tablaFlujosWrapper = $("tablaFlujosWrapper");
const detalleFlujosWrapper = $("detalleFlujosWrapper");

// Lista proveedores
const proveedoresList = $("proveedoresList");
const btnRetirarProveedor = $("btnRetirarProveedor");

/* -------------------- Init -------------------- */
async function init() {
  const articuloId = localStorage.getItem("selectedArticuloId");
  if (!articuloId) {
    alert("No hay artículo seleccionado. Vuelve a INICIO y selecciona/crea un artículo.");
    window.location.href = "index.html";
    return;
  }

  articulo = await getArticuloById(articuloId);
  if (!articulo) {
    alert("No se encontró el artículo seleccionado. Vuelve a INICIO.");
    window.location.href = "index.html";
    return;
  }

  renderContexto();
  await renderProveedores();
  limpiarProveedor();
}

function renderContexto() {
  ctxEmpresa.textContent = articulo.empresaNombre ?? "—";
  ctxArticuloNombre.textContent = articulo.articuloNombre ?? "—";
  ctxFechaCalculo.textContent = articulo.fechaCalculo ?? "—";

  ctxImpuestos.textContent = pct(articulo.impuestosPct);
  ctxWacc.textContent = pct(articulo.waccPct);
  ctxVidaUtil.textContent = `${articulo.vidaUtil ?? "—"} años`;
  ctxInvArticulo.textContent = money(articulo.inversion);
  ctxVrArticulo.textContent = money(articulo.valorResidual);
}

/* -------------------- UI: Proveedores list -------------------- */
async function renderProveedores() {
  const list = await listProveedoresActivos(articulo.id);
  proveedoresList.innerHTML = "";

  if (list.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No hay proveedores activos. Agrega uno en el formulario.";
    proveedoresList.appendChild(p);
    return;
  }

  list.forEach((prov) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item-lista";
    btn.dataset.id = prov.id;
    btn.textContent = `${prov.proveedorNombre} — ${prov.productoNombre}`;

    btn.addEventListener("click", async () => {
      selectedProveedorId = prov.id;

      // Visual selection
      [...proveedoresList.querySelectorAll("button.item-lista")].forEach(x => x.classList.remove("seleccionado"));
      btn.classList.add("seleccionado");

      await cargarProveedor(selectedProveedorId);
    });

    proveedoresList.appendChild(btn);
  });
}

async function cargarProveedor(id) {
  const prov = await getProveedorById(id);
  if (!prov) return;

  proveedorNombre.value = prov.proveedorNombre ?? "";
  productoNombre.value = prov.productoNombre ?? "";
  invProveedor.value = prov.inversion ?? "";
  gastosProveedor.value = prov.gastos ?? "";
  vidaUtilProveedor.value = prov.vidaUtil ?? "";
  vrProveedor.value = prov.valorResidual ?? "";
  pagoEquipo.value = prov.pagoEquipo ?? "";

  // cargar flujos existentes
  const flujos = await listFlujosByProveedor(id);
  currentFlujos = (flujos || [])
    .sort((a, b) => a.anio - b.anio)
    .map(f => ({ anio: f.anio, ventas: f.ventas, costos: f.costos }));

  // si no hay flujos, generamos base con vida útil
  const n = Number(prov.vidaUtil || articulo.vidaUtil || 1);
  if (currentFlujos.length === 0) {
    currentFlujos = Array.from({ length: n }, (_, i) => ({ anio: i + 1, ventas: 0, costos: 0 }));
  }

  renderTablaFlujos(n, currentFlujos);
  renderDetalleFlujos(); // limpio/actualiza
}

/* -------------------- UI: Form actions -------------------- */
function limpiarProveedor() {
  currentFlujos = [];
  proveedorNombre.value = "";
  productoNombre.value = "";
  invProveedor.value = "";
  gastosProveedor.value = "";
  vidaUtilProveedor.value = "";
  vrProveedor.value = "";
  pagoEquipo.value = "";
  
  tablaFlujosWrapper.innerHTML = "";
  detalleFlujosWrapper.innerHTML = "";

  selectedProveedorId = null;
  localStorage.removeItem("selectedProveedorId");

  // quitar seleccionado visual
  [...proveedoresList.querySelectorAll("button.item-lista")].forEach(x => x.classList.remove("seleccionado"));
}

btnLimpiarProveedor.addEventListener("click", () => limpiarProveedor());

btnSiguienteFlujos.addEventListener("click", () => {
  const n = getVidaUtilParaTabla();
  if (!n) return;

  // Si ya existían flujos, los respetamos (ajustando longitud si cambió n)
  if (currentFlujos.length !== n) {
    const newArr = Array.from({ length: n }, (_, i) => {
      const anio = i + 1;
      const found = currentFlujos.find(x => x.anio === anio);
      return found ? { ...found } : { anio, ventas: 0, costos: 0 };
    });
    currentFlujos = newArr;
  } else if (currentFlujos.length === 0) {
    currentFlujos = Array.from({ length: n }, (_, i) => ({ anio: i + 1, ventas: 0, costos: 0 }));
  }

  renderTablaFlujos(n, currentFlujos);
  renderDetalleFlujos(); // sincroniza
});

btnGuardarProveedor.addEventListener("click", async () => {
  const payload = readProveedorForm();
  if (!payload) return;

  const n = payload.vidaUtil;
  if (currentFlujos.length !== n) {
    alert("Primero genera la tabla de flujos con 'Siguiente'.");
    return;
  }

  // tomar valores actuales de tabla
  syncFlujosFromTable();

  // Guardar proveedor (update si existe, add si no)
  if (!selectedProveedorId) {
    const provId = await addProveedor({
      articuloId: articulo.id,
      proveedorNombre: payload.proveedorNombre,
      productoNombre: payload.productoNombre,
      inversion: payload.inversion,
      gastos: payload.gastos,
      vidaUtil: payload.vidaUtil,
      valorResidual: payload.valorResidual,
      pagoEquipo: payload.pagoEquipo
    });

    await upsertFlujos(provId, currentFlujos);
    await renderProveedores();
    await cargarProveedor(provId);

    alert("Proveedor y flujos guardados correctamente.");
    return;
  }

  // UPDATE real (no crea otro registro)
  await updateProveedor(selectedProveedorId, {
    articuloId: articulo.id, // por consistencia
    proveedorNombre: payload.proveedorNombre,
    productoNombre: payload.productoNombre,
    inversion: payload.inversion,
    gastos: payload.gastos,
    vidaUtil: payload.vidaUtil,
    valorResidual: payload.valorResidual,
    pagoEquipo: payload.pagoEquipo
  });

  await upsertFlujos(selectedProveedorId, currentFlujos);

  await renderProveedores();
  await cargarProveedor(selectedProveedorId);

  alert("Proveedor y flujos actualizados correctamente.");
});

btnRetirarProveedor.addEventListener("click", async () => {
  if (!selectedProveedorId) {
    alert("Selecciona un proveedor para retirarlo.");
    return;
  }
  await retirarProveedor(selectedProveedorId);

  limpiarProveedor();
  await renderProveedores();

  alert("Proveedor retirado.");
});

btnDetalleFlujos.addEventListener("click", () => {
  if (tablaFlujosWrapper.innerHTML.trim() === "") {
    alert("Primero genera la tabla de flujos con 'Siguiente'.");
    return;
  }
  syncFlujosFromTable();
  renderDetalleFlujos();
});

btnCalcular.addEventListener("click", async () => {
  // Calcula TODOS los proveedores activos del artículo y manda a resultados.html
  const proveedores = await listProveedoresActivos(articulo.id);
  if (proveedores.length === 0) {
    alert("No hay proveedores para calcular.");
    return;
  }

  const impuestosPct = normalizePct(articulo.impuestosPct);
  const wacc = normalizePct(articulo.waccPct);

  if (!Number.isFinite(impuestosPct) || impuestosPct < 0 || impuestosPct > 1) {
    alert("Impuestos del artículo no válidos. Corrige en INICIO.");
    return;
  }
  if (!Number.isFinite(wacc) || wacc < 0 || wacc > 1) {
    alert("WACC del artículo no válido. Corrige en INICIO.");
    return;
  }

  const results = [];
  for (const prov of proveedores) {
    const flujos = await listFlujosByProveedor(prov.id);
    const flujosClean = (flujos || [])
      .sort((a, b) => a.anio - b.anio)
      .map(f => ({ anio: f.anio, ventas: f.ventas, costos: f.costos }));

    if (flujosClean.length === 0) {
      results.push({
        proveedorId: prov.id,
        proveedorNombre: prov.proveedorNombre,
        productoNombre: prov.productoNombre,
        paybackYears: Infinity,
        paybackLabel: "Sin flujos",
        npv: NaN,
        irr: null
      });
      continue;
    }

    const metrics = computeMetricsForProveedor({
      prov,
      flujos: flujosClean,
      impuestosPct,
      wacc
    });

    results.push({
      proveedorId: prov.id,
      proveedorNombre: prov.proveedorNombre,
      productoNombre: prov.productoNombre,
      ...metrics
    });
  }

  const winner = chooseWinner(results);

  const payload = {
    empresaNombre: articulo.empresaNombre,
    articuloNombre: articulo.articuloNombre,
    fechaCalculo: articulo.fechaCalculo,
    winner,
    results
  };

  localStorage.setItem("calcResult", JSON.stringify(payload));
  window.location.href = "resultados.html";
});

/* -------------------- Flujos table rendering -------------------- */
function getVidaUtilParaTabla() {
  const nProv = Number(toNumber(vidaUtilProveedor.value));
  const n = Number.isFinite(nProv) && nProv >= 1 ? Math.floor(nProv) : Math.floor(Number(articulo.vidaUtil || 1));
  if (!Number.isFinite(n) || n < 1) return alertAndReturn("Vida útil inválida.");
  return n;
}

function renderTablaFlujos(n, flujos) {
  const rows = flujos.sort((a, b) => a.anio - b.anio);

  tablaFlujosWrapper.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Año</th>
          <th>Ventas</th>
          <th>Costos</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${r.anio}</td>
            <td><input type="number" step="0.01" min="0" id="ventas_${r.anio}" value="${toNumber(r.ventas)}"></td>
            <td><input type="number" step="0.01" min="0" id="costos_${r.anio}" value="${toNumber(r.costos)}"></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function syncFlujosFromTable() {
  if (currentFlujos.length === 0) return;

  currentFlujos = currentFlujos.map((r) => ({
    anio: r.anio,
    ventas: toNumber($(`ventas_${r.anio}`)?.value ?? 0),
    costos: toNumber($(`costos_${r.anio}`)?.value ?? 0)
  }));
}

/* -------------------- Cálculo -------------------- */
function computeMetricsForProveedor({ prov, flujos, impuestosPct, wacc }) {
  // Depreciación anual línea recta
  const depActual = (toNumber(articulo.inversion) - toNumber(articulo.valorResidual)) / Math.max(1, Number(articulo.vidaUtil));
  const depNuevo = ((toNumber(prov.inversion) + prov.gastos) - toNumber(prov.valorResidual)) / Math.max(1, Number(prov.vidaUtil));

  const depAcc = depActual * articulo.aniosUso;
  const valorLibrosArticulo = toNumber(articulo.inversion) + toNumber(articulo.gastos) - depAcc;

  const deltaDep = depNuevo - depActual;
  const flujosAdj = flujos.map(f => ({
    ...f,
    costos: toNumber(f.costos)
  }));

  const cashflows = buildCashflowsFromVentasCostos({
    flujos: flujosAdj,
    impuestosPct,
    depAjusteAnual: deltaDep
  });

  const compra = toNumber(prov.inversion) + toNumber(prov.gastos);
  const impuesto = (toNumber(prov.pagoEquipo) - valorLibrosArticulo) * articulo.impuestosPct;
  const initialInvestment = Math.max(0, compra - toNumber(prov.pagoEquipo) + impuesto);
  const residual = toNumber(prov.valorResidual);

  // NPV y residual
  const npvValue = npv(wacc, cashflows, initialInvestment, residual);

  // IRR series: CF0 negativo, CF1..CFn, CF n incluye residual
  const series = [-initialInvestment, ...cashflows, residual];
  const irrValue = irr(series);

  const pb = calcPayback(initialInvestment, cashflows);

  return {
    paybackYears: pb.years,
    paybackLabel: paybackToYMD(pb.years),
    npv: npvValue,
    irr: irrValue
  };
}

function chooseWinner(results) {
  // Regla: mayor VAN, desempate mayor TIR, desempate menor Payback
  const clean = results.filter(r => Number.isFinite(r.npv));

  if (clean.length === 0) {
    return { proveedorId: null, proveedorNombre: "Sin ganador", productoNombre: "", reason: "No hay VAN válido." };
  }

  clean.sort((a, b) => {
    // VAN desc
    if (b.npv !== a.npv) return b.npv - a.npv;

    // TIR desc (null al final)
    const ai = a.irr ?? -Infinity;
    const bi = b.irr ?? -Infinity;
    if (bi !== ai) return bi - ai;

    // Payback asc
    return (a.paybackYears ?? Infinity) - (b.paybackYears ?? Infinity);
  });

  const top = clean[0];
  return {
    proveedorId: top.proveedorId,
    proveedorNombre: top.proveedorNombre,
    productoNombre: top.productoNombre,
    reason: "Mayor VAN (desempate: mayor TIR, menor Payback)."
  };
}

/* -------------------- Detalle Flujos -------------------- */
function renderDetalleFlujos() {
  if (currentFlujos.length === 0) {
    detalleFlujosWrapper.innerHTML = "";
    return;
  }

  const impuestosPct = normalizePct(articulo.impuestosPct);
  if (!Number.isFinite(impuestosPct)) {
    detalleFlujosWrapper.innerHTML = "<p>No se puede mostrar detalle: impuestos inválidos.</p>";
    return;
  }

  const provTmp = readProveedorForm(false);
  if (!provTmp) {
    detalleFlujosWrapper.innerHTML = "<p>Completa datos del proveedor para ver detalle.</p>";
    return;
  }

  const depActual = (toNumber(articulo.inversion) - toNumber(articulo.valorResidual)) / Math.max(1, Number(articulo.vidaUtil));
  const depNuevo = ((provTmp.inversion + provTmp.gastos) - provTmp.valorResidual) / Math.max(1, Number(provTmp.vidaUtil));
  const deltaDep = depNuevo - depActual;
  let ganancia = 0;

  const rows = currentFlujos
    .sort((a, b) => a.anio - b.anio)
    .map((f) => {
      const ventas = toNumber(f.ventas);
      const costos = toNumber(f.costos);
      const utilidadAntesDepImp = ventas + costos;
      const utilidadAntesImp = utilidadAntesDepImp - deltaDep;
      const impuestos = utilidadAntesImp * impuestosPct;
      const utilidadDespImp = utilidadAntesImp - impuestos;
      const flujo = utilidadDespImp + deltaDep;
      ganancia = ganancia + flujo;

      return {
        anio: f.anio,
        ventas,
        costos,
        utilidadAntesDepImp,
        deltaDep,
        utilidadAntesImp,
        impuestos,
        utilidadDespImp,
        flujo,
        ganancia
      };
    });

  detalleFlujosWrapper.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Año</th>
          <th>Ventas</th>
          <th>Costos (+gastos)</th>
          <th>UAI (sin dep)</th>
          <th>Δ Dep</th>
          <th>UAI (con dep)</th>
          <th>Impuestos</th>
          <th>UDI</th>
          <th>Flujo</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.anio}</td>
            <td>${money(r.ventas)}</td>
            <td>${money(r.costos)}</td>
            <td>${money(r.utilidadAntesDepImp)}</td>
            <td>${money(r.deltaDep)}</td>
            <td>${money(r.utilidadAntesImp)}</td>
            <td>${money(r.impuestos)}</td>
            <td>${money(r.utilidadDespImp)}</td>
            <td><strong>${money(r.flujo)}</strong></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <p>Ganancia: ${money(ganancia)}</p>
  `;
}

/* -------------------- Read/Validate provider form -------------------- */
function readProveedorForm(showAlerts = true) {
  const pn = proveedorNombre.value.trim();
  const pr = productoNombre.value.trim();

  const inv = toNumber(invProveedor.value);
  const gastos = toNumber(gastosProveedor.value);

  const vida = Math.floor(toNumber(vidaUtilProveedor.value || articulo.vidaUtil));
  const vr = toNumber(vrProveedor.value);
  const pago = toNumber(pagoEquipo.value);

  const errs = [];

  if (!pn) errs.push("Nombre del proveedor es requerido.");
  if (!pr) errs.push("Nombre del producto es requerido.");
  if (!Number.isFinite(inv) || inv <= 0) errs.push("Inversión del proveedor debe ser > 0.");
  if (!Number.isFinite(gastos) || gastos < 0) errs.push("Gastos del proveedor debe ser 0 o mayor.");
  if (!Number.isFinite(vida) || vida < 1) errs.push("Vida útil del proveedor debe ser >= 1.");
  if (!Number.isFinite(vr) || vr < 0) errs.push("Valor residual del proveedor debe ser 0 o mayor.");
  if (!Number.isFinite(pago) || pago <= 0) errs.push("Pago por el artículo debe ser > 0.");
  if (Number.isFinite(inv) && Number.isFinite(vr) && vr > inv) errs.push("Valor residual no puede exceder inversión.");

  if (errs.length > 0) {
    if (showAlerts) alert(errs.join("\n"));
    return null;
  }

  return {
    proveedorNombre: pn,
    productoNombre: pr,
    inversion: inv,
    gastos,
    vidaUtil: vida,
    valorResidual: vr,
    pagoEquipo: pago
  };
}

/* -------------------- Start -------------------- */
init();