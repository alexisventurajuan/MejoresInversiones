import {
  money,
  fmtTir,
  $
} from "./utilidades.js";

function getPayload() {
  const raw = localStorage.getItem("calcResult");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function render() {
  const payload = getPayload();
  if (!payload) {
    alert("No hay resultados calculados. Vuelve a Proveedores y presiona Calcular.");
    window.location.href = "proveedores.html";
    return;
  }

  const { empresaNombre, articuloNombre, fechaCalculo, winner, results } = payload;

  if ($("resEmpresa")) $("resEmpresa").textContent = empresaNombre ?? "—";
  if ($("resArticulo")) $("resArticulo").textContent = articuloNombre ?? "—";
  if ($("resFecha")) $("resFecha").textContent = fechaCalculo ?? "—";

  if ($("resGanador")) {
    $("resGanador").textContent = winner?.proveedorNombre
      ? `${winner.proveedorNombre} (${winner.productoNombre || "—"})`
      : "Sin ganador";
  }

  const cont = $("resTabla");
  if (!cont) return;

  const rows = (results || []).slice().sort((a, b) => {
    // Orden visual igual a regla de ganador
    const an = Number.isFinite(a.npv) ? a.npv : -Infinity;
    const bn = Number.isFinite(b.npv) ? b.npv : -Infinity;
    if (bn !== an) return bn - an;

    const ai = a.irr ?? -Infinity;
    const bi = b.irr ?? -Infinity;
    if (bi !== ai) return bi - ai;

    const ap = a.paybackYears ?? Infinity;
    const bp = b.paybackYears ?? Infinity;
    return ap - bp;
  });

  cont.innerHTML = `
    <h2>Detalles</h2>
    <table class="tabla">
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Producto</th>
          <th>Periodo de recuperación</th>
          <th>VAN</th>
          <th>TIR</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
    const isWinner = winner?.proveedorId && r.proveedorId === winner.proveedorId;
    return `
            <tr ${isWinner ? 'style="font-weight:700;"' : ""}>
              <td>${r.proveedorNombre ?? "—"}</td>
              <td>${r.productoNombre ?? "—"}</td>
              <td>${r.paybackLabel ?? "—"}</td>
              <td>${money(r.npv)}</td>
              <td>${fmtTir(r.irr)}</td>
            </tr>
          `;
  }).join("")}
      </tbody>
    </table>
    <p><strong>Criterio ganador:</strong> ${winner?.reason ?? "—"}</p>
  `;
}

render();
