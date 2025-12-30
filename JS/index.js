import { 
  addArticulo, 
  listArticulosActivos, 
  retirarArticulo, 
  updateArticulo
} from "./db.js";

import {
  normalizePct,
  $,
  toNumberStrict
} from "./utilidades.js";

const form = $("formArticulo");
const list = $("articulosList");
const btnRetirar = $("btnRetirarArticulo");
const btnLimpiarArticulo = document.getElementById("btnLimpiarArticulo");

let selectedArticuloId = null;

function readForm() {
  const impuestosRaw = toNumberStrict($("impuestosPct").value);
  const waccRaw = toNumberStrict($("waccPct").value);

  const impuestosPct = normalizePct(impuestosRaw);
  const waccPct = normalizePct(waccRaw);

  return {
    empresaNombre: $("empresaNombre").value.trim(),
    articuloNombre: $("articuloNombre").value.trim(),
    inversion: toNumberStrict($("inversion").value),
    gastos: toNumberStrict($("gastos").value),
    impuestosPct,
    waccPct,
    vidaUtil: Math.floor(toNumberStrict($("vidaUtil").value)),
    aniosUso: Math.floor(toNumberStrict($("aniosUso").value)),
    valorResidual: toNumberStrict($("valorResidual").value),
    fechaCalculo: $("fechaCalculo").value.trim()
  };
}

function validateArticulo(a) {
  const errors = [];

  if (!a.empresaNombre) errors.push("Nombre de la empresa es requerido.");
  if (!a.articuloNombre) errors.push("Artículo es requerido.");
  if (!a.fechaCalculo) errors.push("Fecha de cálculo es requerida.");

  if (!Number.isFinite(a.inversion) || a.inversion <= 0) errors.push("Inversión debe ser mayor a 0.");
  if (!Number.isFinite(a.gastos) || a.gastos < 0) errors.push("Gastos debe ser 0 o mayor.");

  if (!Number.isFinite(a.impuestosPct) || a.impuestosPct < 0 || a.impuestosPct > 1) {
    errors.push("Pago de impuestos debe estar entre 0% y 100%.");
  }

  if (!Number.isFinite(a.waccPct) || a.waccPct < 0 || a.waccPct > 1) {
    errors.push("Costo de capital (WACC) debe estar entre 0% y 100%.");
  }

  if (!Number.isFinite(a.vidaUtil) || a.vidaUtil < 1) errors.push("Vida útil debe ser un entero >= 1.");
  if (!Number.isFinite(a.aniosUso) || a.aniosUso < 0) errors.push("Años de uso debe ser un entero >= 0.");

  if (Number.isFinite(a.vidaUtil) && Number.isFinite(a.aniosUso) && a.aniosUso > a.vidaUtil) {
    errors.push("Años de uso no puede ser mayor que la vida útil.");
  }

  if (!Number.isFinite(a.valorResidual) || a.valorResidual < 0) errors.push("Valor residual debe ser 0 o mayor.");

  // regla práctica: valor residual no debe exceder inversión
  if (Number.isFinite(a.inversion) && Number.isFinite(a.valorResidual) && a.valorResidual > a.inversion) {
    errors.push("Valor residual no puede ser mayor que la inversión.");
  }

  return errors;
}

function fillFormFromArticulo(a) {
  $("empresaNombre").value = a.empresaNombre ?? "";
  $("articuloNombre").value = a.articuloNombre ?? "";
  $("inversion").value = a.inversion ?? "";
  $("gastos").value = a.gastos ?? "";
  $("impuestosPct").value = a.impuestosPct ?? "";
  $("waccPct").value = a.waccPct ?? "";
  $("vidaUtil").value = a.vidaUtil ?? "";
  $("aniosUso").value = a.aniosUso ?? "";
  $("valorResidual").value = a.valorResidual ?? "";
  $("fechaCalculo").value = a.fechaCalculo ?? "";
}

async function renderArticulos() {
  const articulos = await listArticulosActivos();
  list.innerHTML = "";

  if (articulos.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No hay artículos activos. Agrega uno con el formulario.";
    list.appendChild(empty);
    return;
  }

  articulos.forEach((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item-lista";
    btn.textContent = `${a.articuloNombre} — ${a.empresaNombre}`;
    btn.dataset.id = a.id;

    btn.addEventListener("click", () => {
      selectedArticuloId = a.id;

      fillFormFromArticulo(a);

      localStorage.setItem("selectedArticuloId", String(a.id));

      [...list.querySelectorAll("button.item-lista")].forEach(x => x.classList.remove("seleccionado"));
      btn.classList.add("seleccionado");
    });

    list.appendChild(btn);
  });

  const saved = localStorage.getItem("selectedArticuloId");
  if (saved) {
    const found = articulos.find(x => String(x.id) === String(saved));
    if (found) {
      selectedArticuloId = found.id;
      fillFormFromArticulo(found);
      const btn = list.querySelector(`button.item-lista[data-id="${found.id}"]`);
      if (btn) btn.classList.add("seleccionado");
    }
  }
}

function limpiarCamposArticulo() {
  $("empresaNombre").value = "";
  $("articuloNombre").value = "";
  $("inversion").value = "";
  $("gastos").value = "";
  $("impuestosPct").value = "";
  $("waccPct").value = "";
  $("vidaUtil").value = "";
  $("aniosUso").value = "";
  $("valorResidual").value = "";
  $("fechaCalculo").value = "";

  selectedArticuloId = null;
  localStorage.removeItem("selectedArticuloId");

  // Quitar seleccionado visual si existe
  [...list.querySelectorAll("button.item-lista")].forEach(x => x.classList.remove("seleccionado"));
}

btnRetirar.addEventListener("click", async () => {
  if (!selectedArticuloId) {
    alert("Selecciona un artículo para retirarlo.");
    return;
  }
  await retirarArticulo(selectedArticuloId);

  limpiarCamposArticulo();
  await renderArticulos();

  alert("Artículo retirado.");
});

btnLimpiarArticulo.addEventListener("click", () => limpiarCamposArticulo());

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = readForm();
  const errors = validateArticulo(data);

  if (errors.length > 0) {
    alert(errors.join("\n"));
    return;
  }

  // Si hay un artículo seleccionado, actualiza; si no, crea nuevo
  if (selectedArticuloId) {
    await updateArticulo(selectedArticuloId, data);
    localStorage.setItem("selectedArticuloId", String(selectedArticuloId));
  } else {
    const id = await addArticulo(data);
    selectedArticuloId = id;
    localStorage.setItem("selectedArticuloId", String(id));
    alert("Proveedor y flujos guardados correctamente.");
  }

  // Navegar a proveedores
  window.location.href = "proveedores.html";
});

renderArticulos();
