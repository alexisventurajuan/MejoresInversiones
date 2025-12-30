const DB_NAME = "alt_inversion_db";
const DB_VERSION = 1;
const nombreTablaArticulos = "articulos"
const nombreTablaProveedores = "proveedores"

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Articulos
      if (!db.objectStoreNames.contains(nombreTablaArticulos)) {
        const store = db.createObjectStore(nombreTablaArticulos, { keyPath: "id", autoIncrement: true });
        store.createIndex("activo", "activo", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      // Proveedores
      if (!db.objectStoreNames.contains(nombreTablaProveedores)) {
        const store = db.createObjectStore(nombreTablaProveedores, { keyPath: "id", autoIncrement: true });
        store.createIndex("articuloId", "articuloId", { unique: false });
        store.createIndex("activo", "activo", { unique: false });
      }

      // Flujos por proveedor
      if (!db.objectStoreNames.contains("flujos")) {
        const store = db.createObjectStore("flujos", { keyPath: "id", autoIncrement: true });
        store.createIndex("proveedorId", "proveedorId", { unique: false });
        store.createIndex("proveedorId_anio", ["proveedorId", "anio"], { unique: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function txStore(storeName, mode = "readonly") {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

async function addRecord(storeName, data) {
  const store = await txStore(storeName, "readwrite");
  const now = new Date().toISOString();
  const record = { ...data, activo: true, createdAt: now };
  return new Promise((resolve, reject) => {
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function updateRecord(storeName, Id, data) {
  const store = await txStore(storeName, "readwrite");

  return new Promise((resolve, reject) => {
    const getReq = store.get(Number(Id));

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error(storeName + " no encontrado para actualizar."));
        return;
      }

      const updated = {
        ...existing,
        ...data,
        Id: Number(Id),
        activo: existing.activo ?? true,
        createdAt: existing.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

async function softDelete(storeName, Id) {
  const store = await txStore(storeName, "readwrite");

  return new Promise((resolve, reject) => {
    const reqGet = store.get(Number(Id));

    reqGet.onsuccess = () => {
      const objetoRetirar = reqGet.result;
      if (!objetoRetirar) {
        resolve(false);
        return;
      }

      objetoRetirar.activo = false;
      objetoRetirar.updatedAt = new Date().toISOString();

      const reqPut = store.put(objetoRetirar);
      reqPut.onsuccess = () => resolve(true);
      reqPut.onerror = () => reject(reqPut.error);
    };

    reqGet.onerror = () => reject(reqGet.error);
  });
}

export async function getRecordById(storeName, Id) {
  const store = await txStore(storeName, "readonly");

  return new Promise((resolve, reject) => {
    const req = store.get(Number(Id));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/* ----------------- ARTICULOS ----------------- */
export const addArticulo = (data) => addRecord(nombreTablaArticulos, data);
export const updateArticulo = (id,data) => updateRecord(nombreTablaArticulos, id, data);
export const retirarArticulo = (id) => softDelete(nombreTablaArticulos, id);
export const getArticuloById = (id) => getRecordById(nombreTablaArticulos, id);

export async function listArticulosActivos() {
  const store = await txStore(nombreTablaArticulos, "readonly");

  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      // Considera registros de activos que no poseen campo de activo
      const activos = all.filter(a => a.activo === true || a.activo === undefined);
      resolve(activos);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ----------------- PROVEEDORES ----------------- */
export const addProveedor = (data) => addRecord(nombreTablaProveedores, data);
export const updateProveedor = (id, data) => updateRecord(nombreTablaProveedores, id, data);
export const retirarProveedor = (id) => softDelete(nombreTablaProveedores, id);
export const getProveedorById = (id) => getRecordById(nombreTablaProveedores, id);

export async function listProveedoresActivos(articuloId) {
  const store = await txStore(nombreTablaProveedores, "readonly");
  const idx = store.index("articuloId");
  
  return new Promise((resolve, reject) => {
    const req = idx.getAll(Number(articuloId));
    req.onsuccess = () => resolve((req.result || []).filter(p => p.activo));
    req.onerror = () => reject(req.error);
  });
}

/* ----------------- FLUJOS ----------------- */
export async function upsertFlujos(proveedorId, flujos) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("flujos", "readwrite");
    const store = tx.objectStore("flujos");
    const idx = store.index("proveedorId");

    const provId = Number(proveedorId);

    // 1) Traer existentes dentro del mismo tx
    const getReq = idx.getAll(provId);

    getReq.onsuccess = () => {
      const existentes = getReq.result || [];

      // 2) Borrar existentes
      existentes.forEach((f) => store.delete(f.id));

      // 3) Insertar nuevos
      (flujos || []).forEach((f) => {
        store.add({
          proveedorId: provId,
          anio: Number(f.anio),
          ventas: Number(f.ventas) || 0,
          costos: Number(f.costos) || 0,
        });
      });
    };

    getReq.onerror = () => reject(getReq.error);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

export async function listFlujosByProveedor(proveedorId) {
  const store = await txStore("flujos", "readonly");
  const idx = store.index("proveedorId");
  return new Promise((resolve, reject) => {
    const req = idx.getAll(Number(proveedorId));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}