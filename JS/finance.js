import {
  toNumber,
} from "./utilidades.js";

export function calcPayback(initialInvestment, cashflows) {
  let accum = -initialInvestment;
  for (let i = 0; i < cashflows.length; i++) {
    const cf = cashflows[i];
    const prev = accum;
    accum += cf;

    if (accum >= 0) {
      const year = i + 1;
      const remanente = -prev; // Lo que falta para llegar a cero
      const fraction = cf !== 0 ? remanente / cf : 0;
      return { years: (year - 1) + fraction, yearIndex: year, remanente, cfYear: cf };
    }
  }
  return { years: Infinity, yearIndex: null, remanente: null, cfYear: null };
}

export function paybackToYMD(yearsFloat) {
  if (!Number.isFinite(yearsFloat)) return "No recupera";
  const years = Math.floor(yearsFloat);
  const monthsFloat = (yearsFloat - years) * 12;
  const months = Math.floor(monthsFloat);
  const days = Math.floor((monthsFloat - months) * 30.5);
  return `${years} años, ${months} meses y ${days} días`;
}

export function npv(rate, cashflows, initialInvestment, residual = 0) {
  let total = -initialInvestment;
  for (let t = 0; t < cashflows.length; t++) {
    total += cashflows[t] / Math.pow(1 + rate, t + 1);
  }
  total += residual / Math.pow(1 + rate, cashflows.length);
  return total;
}

export function irr(cashflowSeries) {
  // Método híbrido: bisección robusta
  const f = (r) => {
    let s = 0;
    for (let t = 0; t < cashflowSeries.length; t++) {
      s += cashflowSeries[t] / Math.pow(1 + r, t);
    }
    return s;
  };

  let low = -0.9999;
  let high = 10;
  let fLow = f(low);
  let fHigh = f(high);

  // Si no hay cambio de signo, no se garantiza TIR real
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

export function buildCashflowsFromVentasCostos({ flujos, impuestosPct, depAjusteAnual = 0 }) {
  return flujos
    .sort((a, b) => a.anio - b.anio)
    .map((f) => {
      const ventas = toNumber(f.ventas);
      const costos = toNumber(f.costos);
      const utilidadAntesDepImp = ventas + costos;
      const utilidadAntesImp = utilidadAntesDepImp - depAjusteAnual;
      const impuestos = utilidadAntesImp * impuestosPct;
      const utilidadDespImp = utilidadAntesImp - impuestos;
      const flujo = utilidadDespImp + depAjusteAnual;
      return flujo;
    });
}
