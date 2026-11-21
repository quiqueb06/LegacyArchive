import "server-only";
import { readFileSync as readFileSyncSemilla } from "node:fs";
import pathSemilla from "node:path";
import { createHash, randomUUID } from "node:crypto";
import catalogoJson from "../../catalog/catalogo.json";
import { leerFuente } from "@/domain/adaptadores";
import { Catalogo, type Tramite } from "@/domain/catalogo";
import { esConcepto, esTipoDocumento } from "@/domain/conceptos";
import { evaluarProceso, type EvaluacionProceso } from "@/domain/motor";
import { claveComparacion, limpiarEspacios } from "@/domain/normalizar";
import type { AccionConfirmacion, Confirmacion, DocumentoGuardado, TipoFuente, ValorGuardado } from "@/domain/tipos";
import { decidirVinculacion } from "@/domain/vinculacion";
import { getDb } from "./db";

export const EXPEDIENTE_ID = "EXP-DEMO";
export const EXPEDIENTE_REF = "LA-DEMO-001";
export const AUTOR = "María López (persona ficticia de la demo)";

export const catalogo = Catalogo.parse(catalogoJson);

export function tramite(id: string): Tramite | undefined {
  return catalogo.tramites.find((t) => t.id === id);
}

const ahora = () => new Date().toISOString();
type Fila = Record<string, unknown>;

export function asegurarExpediente() {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO expedientes (id, ref, creado_en) VALUES (?, ?, ?)").run(EXPEDIENTE_ID, EXPEDIENTE_REF, ahora());
  for (const [id, nombre, tipo] of [
    ["captura", "Escrito por la persona en Lazô", "captura_usuario"],
    ["respuesta", "Respuestas al iniciar el trámite", "respuesta_inicial"],
  ] as const) {
    db.prepare("INSERT OR IGNORE INTO fuentes (id, expediente_id, nombre_archivo, tipo, importado_en) VALUES (?, ?, ?, ?, ?)").run(id, EXPEDIENTE_ID, nombre, tipo, ahora());
  }
}

// ---------- Lectura ----------

export function valores(): ValorGuardado[] {
  asegurarExpediente();
  const filas = getDb()
    .prepare(`SELECT v.*, f.nombre_archivo, f.tipo FROM valores v JOIN fuentes f ON f.id = v.fuente_id WHERE v.expediente_id = ? ORDER BY v.importado_en, v.rowid`)
    .all(EXPEDIENTE_ID) as Fila[];
  return filas.map((f) => ({
    id: String(f.id),
    concepto: String(f.concepto),
    valor: String(f.valor),
    valorOriginal: String(f.valor_original),
    campoOrigen: String(f.campo_origen),
    fechaDato: (f.fecha_dato as string | null) ?? null,
    importadoEn: String(f.importado_en),
    fuente: { id: String(f.fuente_id), nombre: String(f.nombre_archivo), tipo: f.tipo as TipoFuente },
    procesoId: (f.proceso_id as string | null) ?? null,
  }));
}

export function documentos(): DocumentoGuardado[] {
  asegurarExpediente();
  const filas = getDb()
    .prepare("SELECT id, tipo, nombre_archivo, fecha_emision, aportado_en, proceso_id, sha256, tamano, nota FROM documentos WHERE expediente_id = ? ORDER BY aportado_en")
    .all(EXPEDIENTE_ID) as Fila[];
  return filas.map((f) => ({
    id: String(f.id), tipo: String(f.tipo), nombreArchivo: String(f.nombre_archivo), fechaEmision: (f.fecha_emision as string | null) ?? null,
    aportadoEn: String(f.aportado_en), procesoId: (f.proceso_id as string | null) ?? null, sintetico: true, sha256: String(f.sha256), tamano: Number(f.tamano), nota: (f.nota as string | null) ?? null,
  }));
}

export function contenidoDocumento(id: string): { nombre: string; bytes: Uint8Array } | null {
  const f = getDb().prepare("SELECT nombre_archivo, contenido FROM documentos WHERE id = ? AND expediente_id = ?").get(id, EXPEDIENTE_ID) as Fila | undefined;
  return f ? { nombre: String(f.nombre_archivo), bytes: f.contenido as Uint8Array } : null;
}

export function confirmaciones(): Confirmacion[] {
  asegurarExpediente();
  const filas = getDb().prepare("SELECT * FROM confirmaciones WHERE expediente_id = ? ORDER BY fecha, rowid").all(EXPEDIENTE_ID) as Fila[];
  return filas.map((f) => ({
    id: String(f.id), objetivo: String(f.objetivo), valorClave: String(f.valor_clave), considerados: JSON.parse(String(f.considerados_json)),
    accion: f.accion as AccionConfirmacion, motivo: String(f.motivo), autor: String(f.autor), fecha: String(f.fecha),
    procesoId: (f.proceso_id as string | null) ?? null, tramiteId: (f.tramite_id as string | null) ?? null,
  }));
}

export interface FuenteImportada {
  id: string;
  nombreArchivo: string;
  tipo: TipoFuente;
  importadoEn: string;
  totalFilas: number;
  vinculados: number;
  errores: { fila: number; mensaje: string }[];
  noVinculados: { ref: string | null; nombre: string; decision: string; motivo: string }[];
}

export function fuentesImportadas(): FuenteImportada[] {
  asegurarExpediente();
  const db = getDb();
  const filas = db.prepare("SELECT * FROM fuentes WHERE expediente_id = ? AND tipo IN ('csv_heredado','dbf_heredado','json_exportacion') ORDER BY importado_en").all(EXPEDIENTE_ID) as Fila[];
  return filas.map((f) => ({
    id: String(f.id), nombreArchivo: String(f.nombre_archivo), tipo: f.tipo as TipoFuente, importadoEn: String(f.importado_en),
    totalFilas: Number(f.total_filas ?? 0), vinculados: Number(f.vinculados ?? 0), errores: JSON.parse(String(f.errores_json ?? "[]")),
    noVinculados: (db.prepare("SELECT ref, nombre, decision, motivo FROM registros_no_vinculados WHERE fuente_id = ?").all(String(f.id)) as Fila[]).map((r) => ({
      ref: (r.ref as string | null) ?? null, nombre: String(r.nombre), decision: String(r.decision), motivo: String(r.motivo),
    })),
  }));
}

export interface Proceso {
  id: string;
  tramiteId: string;
  tipoSolicitante: string;
  abiertoEn: string;
  autorizado: boolean;
  autorizadoEn: string | null;
}

export function procesos(): Proceso[] {
  asegurarExpediente();
  return (getDb().prepare("SELECT * FROM procesos WHERE expediente_id = ? ORDER BY abierto_en").all(EXPEDIENTE_ID) as Fila[]).map(aProceso);
}

export function procesoPorTramite(tramiteId: string): Proceso | null {
  asegurarExpediente();
  const f = getDb().prepare("SELECT * FROM procesos WHERE expediente_id = ? AND tramite_id = ?").get(EXPEDIENTE_ID, tramiteId) as Fila | undefined;
  return f ? aProceso(f) : null;
}

function aProceso(f: Fila): Proceso {
  return {
    id: String(f.id), tramiteId: String(f.tramite_id), tipoSolicitante: String(f.tipo_solicitante), abiertoEn: String(f.abierto_en),
    autorizado: Number(f.autorizado) === 1, autorizadoEn: (f.autorizado_en as string | null) ?? null,
  };
}

export function evaluar(tramiteId: string): { proceso: Proceso; tramite: Tramite; evaluacion: EvaluacionProceso } | null {
  const t = tramite(tramiteId);
  const p = procesoPorTramite(tramiteId);
  if (!t || !p) return null;
  const evaluacion = evaluarProceso({
    tramite: t, procesoId: p.id, valores: valores(), documentos: documentos(), confirmaciones: confirmaciones(), autorizado: p.autorizado, hoy: new Date(),
  });
  return { proceso: p, tramite: t, evaluacion };
}

// ---------- Escritura ----------

export class ErrorDemo extends Error {
  constructor(mensaje: string, public estado = 400) {
    super(mensaje);
  }
}

export function abrirProceso(tramiteId: string, tipoSolicitante: string, respuestas: { inscrita_comerciante?: "si" | "no"; copropiedad?: "si" | "no" }): Proceso {
  const t = tramite(tramiteId);
  if (!t) throw new ErrorDemo("Trámite desconocido.", 404);
  if (!t.tipos_solicitante.includes(tipoSolicitante)) throw new ErrorDemo("Ese tipo de solicitante está fuera del alcance de la demo.");
  asegurarExpediente();
  const db = getDb();
  const existente = procesoPorTramite(tramiteId);
  const id = existente?.id ?? `PROC-${tramiteId}`;
  if (!existente) db.prepare("INSERT INTO procesos (id, expediente_id, tramite_id, tipo_solicitante, abierto_en) VALUES (?, ?, ?, ?, ?)").run(id, EXPEDIENTE_ID, tramiteId, tipoSolicitante, ahora());
  for (const [concepto, v] of [
    ["persona.inscrita_comerciante", respuestas.inscrita_comerciante],
    ["empresa.copropiedad", respuestas.copropiedad],
  ] as const) {
    if (v) registrarValorPropio(id, tramiteId, concepto, v, "respuesta", "Respuesta al iniciar el trámite", "capturar");
  }
  return procesoPorTramite(tramiteId)!;
}

export function autorizarReutilizacion(procesoId: string) {
  const p = getDb().prepare("SELECT tramite_id FROM procesos WHERE id = ?").get(procesoId) as Fila | undefined;
  if (!p) throw new ErrorDemo("Proceso no encontrado.", 404);
  const f = ahora();
  getDb().prepare("UPDATE procesos SET autorizado = 1, autorizado_en = COALESCE(autorizado_en, ?) WHERE id = ?").run(f, procesoId);
  insertarConfirmacion({ objetivo: "autorizacion", valorClave: procesoId, considerados: [], accion: "autorizar_reutilizacion", motivo: "La persona autorizó usar su expediente en este trámite.", procesoId, tramiteId: String(p.tramite_id) });
}

export interface ResultadoImportacion {
  fuenteId: string;
  formato: string;
  totalFilas: number;
  vinculados: number;
  valoresGuardados: number;
  errores: { fila: number; mensaje: string }[];
  noVinculados: { ref: string | null; nombre: string; decision: string; motivo: string }[];
}

export function importarArchivo(nombreArchivo: string, bytes: Uint8Array, procesoId?: string): ResultadoImportacion {
  asegurarExpediente();
  const db = getDb();
  const sha = createHash("sha256").update(bytes).digest("hex");
  const dup = db.prepare("SELECT nombre_archivo FROM fuentes WHERE expediente_id = ? AND sha256 = ?").get(EXPEDIENTE_ID, sha) as Fila | undefined;
  if (dup) throw new ErrorDemo(`Este archivo ya se importó («${dup.nombre_archivo}»). No se duplican valores.`, 409);

  const lectura = leerFuente(nombreArchivo, bytes);
  if (!lectura.ok) throw new ErrorDemo(lectura.error, 422);

  const actuales = valores();
  const cuis = [...new Set(actuales.filter((v) => v.concepto === "persona.cui").map((v) => v.valor))];
  const nits = [...new Set(actuales.filter((v) => v.concepto === "persona.nit").map((v) => v.valor))];
  const decisiones = decidirVinculacion({ ref: EXPEDIENTE_REF, cuis, nits }, lectura.registros);
  const vinculados = decisiones.filter((d) => d.decision === "vinculado");
  if (vinculados.length === 0 && lectura.errores.length === lectura.totalFilas) {
    throw new ErrorDemo(`No se pudo importar ninguna fila: ${lectura.errores.map((e) => `fila ${e.fila}: ${e.mensaje}`).join(" ")}`, 422);
  }

  const fuenteId = `F-${randomUUID().slice(0, 8)}`;
  const f = ahora();
  let guardados = 0;
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO fuentes (id, expediente_id, nombre_archivo, tipo, sha256, importado_en, total_filas, vinculados, errores_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(fuenteId, EXPEDIENTE_ID, nombreArchivo, lectura.formato, sha, f, lectura.totalFilas, vinculados.length, JSON.stringify(lectura.errores));
    const ins = db.prepare("INSERT INTO valores (id, expediente_id, concepto, valor, valor_original, campo_origen, fecha_dato, importado_en, fuente_id, proceso_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)");
    for (const d of vinculados) {
      for (const v of d.registro.valores) {
        ins.run(randomUUID(), EXPEDIENTE_ID, v.concepto, v.valor, v.valorOriginal, v.campoOrigen, v.fechaDato, f, fuenteId);
        guardados++;
      }
    }
    const nv = db.prepare("INSERT INTO registros_no_vinculados (id, fuente_id, ref, nombre, decision, motivo) VALUES (?, ?, ?, ?, ?, ?)");
    for (const d of decisiones.filter((x) => x.decision !== "vinculado")) nv.run(randomUUID(), fuenteId, d.registro.refExpediente, d.registro.nombreReferencia, d.decision, d.motivo);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  if (procesoId) autorizarReutilizacion(procesoId);
  return {
    fuenteId, formato: lectura.formato, totalFilas: lectura.totalFilas, vinculados: vinculados.length, valoresGuardados: guardados, errores: lectura.errores,
    noVinculados: decisiones.filter((x) => x.decision !== "vinculado").map((d) => ({ ref: d.registro.refExpediente, nombre: d.registro.nombreReferencia, decision: d.decision, motivo: d.motivo })),
  };
}

function insertarConfirmacion(c: Omit<Confirmacion, "id" | "fecha" | "autor">) {
  getDb()
    .prepare("INSERT INTO confirmaciones (id, expediente_id, objetivo, valor_clave, considerados_json, accion, motivo, autor, fecha, proceso_id, tramite_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), EXPEDIENTE_ID, c.objetivo, c.valorClave, JSON.stringify(c.considerados), c.accion, c.motivo, AUTOR, ahora(), c.procesoId, c.tramiteId);
}

function procesoTramite(procesoId: string): string {
  const p = getDb().prepare("SELECT tramite_id FROM procesos WHERE id = ?").get(procesoId) as Fila | undefined;
  if (!p) throw new ErrorDemo("Proceso no encontrado.", 404);
  return String(p.tramite_id);
}

/** Confirma o resuelve un dato eligiendo una de las opciones visibles. */
export function confirmarDato(procesoId: string, concepto: string, valorClave: string, motivo: string) {
  if (!esConcepto(concepto)) throw new ErrorDemo("Concepto desconocido.");
  const tramiteId = procesoTramite(procesoId);
  const claves = [...new Set(valores().filter((v) => v.concepto === concepto).map((v) => claveComparacion(concepto, v.valor)))];
  if (!claves.includes(valorClave)) throw new ErrorDemo("La opción elegida ya no existe en el expediente. Recarga la página.", 409);
  const conflicto = claves.length > 1;
  const m = limpiarEspacios(motivo);
  if (conflicto && m.length < 3) throw new ErrorDemo("Para resolver un conflicto escribe el motivo de tu elección.");
  insertarConfirmacion({
    objetivo: concepto, valorClave, considerados: claves, accion: conflicto ? "resolver_conflicto" : "confirmar",
    motivo: m || "Revisado por la persona.", procesoId, tramiteId,
  });
}

/** Escribe un dato faltante o corrige uno existente. Nunca borra los valores anteriores. */
export function capturarDato(procesoId: string, concepto: string, valor: string, motivo: string) {
  if (!esConcepto(concepto)) throw new ErrorDemo("Concepto desconocido.");
  const v = limpiarEspacios(valor);
  if (!v) throw new ErrorDemo("Escribe un valor.");
  if (/^empresa\.(empleados_a_contratar|trabajadores_a_inscribir)$/.test(concepto) && !/^\d{1,5}$/.test(v)) throw new ErrorDemo("Escribe un número entero.");
  const previos = valores().some((x) => x.concepto === concepto);
  const m = limpiarEspacios(motivo);
  if (previos && m.length < 3) throw new ErrorDemo("Para corregir un dato existente escribe el motivo.");
  registrarValorPropio(procesoId, procesoTramite(procesoId), concepto, v, "captura", m || "Dato faltante completado por la persona.", previos ? "corregir" : "capturar");
}

function registrarValorPropio(procesoId: string, tramiteId: string, concepto: string, valor: string, fuenteId: "captura" | "respuesta", motivo: string, accion: AccionConfirmacion) {
  const db = getDb();
  const ya = valores().find((x) => x.concepto === concepto && claveComparacion(concepto, x.valor) === claveComparacion(concepto, valor));
  if (!ya) {
    db.prepare("INSERT INTO valores (id, expediente_id, concepto, valor, valor_original, campo_origen, fecha_dato, importado_en, fuente_id, proceso_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), EXPEDIENTE_ID, concepto, valor, valor, fuenteId === "captura" ? "Formulario de Lazô" : "Pregunta inicial", ahora().slice(0, 10), ahora(), fuenteId, procesoId);
  }
  const claves = [...new Set(valores().filter((x) => x.concepto === concepto).map((x) => claveComparacion(concepto, x.valor)))];
  insertarConfirmacion({ objetivo: concepto, valorClave: claveComparacion(concepto, valor), considerados: claves, accion, motivo, procesoId, tramiteId });
}

export function aportarDocumento(args: { procesoId: string | null; tipo: string; nombreArchivo: string; bytes: Uint8Array; fechaEmision: string | null; declaraSintetico: boolean; nota?: string }) {
  if (!esTipoDocumento(args.tipo)) throw new ErrorDemo("Tipo de documento desconocido.");
  if (!args.declaraSintetico) throw new ErrorDemo("Esta demo solo admite documentos sintéticos. Marca la casilla que lo declara.");
  if (args.bytes.length === 0) throw new ErrorDemo("El archivo está vacío.");
  if (args.bytes.length > 5_000_000) throw new ErrorDemo("El archivo supera 5 MB.");
  if (args.fechaEmision && !/^\d{4}-\d{2}-\d{2}$/.test(args.fechaEmision)) throw new ErrorDemo("Fecha de emisión inválida.");
  asegurarExpediente();
  getDb()
    .prepare("INSERT INTO documentos (id, expediente_id, tipo, nombre_archivo, fecha_emision, aportado_en, proceso_id, sha256, tamano, contenido, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(`DOC-${randomUUID().slice(0, 8)}`, EXPEDIENTE_ID, args.tipo, args.nombreArchivo, args.fechaEmision, ahora(), args.procesoId, createHash("sha256").update(args.bytes).digest("hex"), args.bytes.length, args.bytes, args.nota ?? null);
}

export function confirmarDocumento(procesoId: string, documentoId: string, motivo: string) {
  const d = documentos().find((x) => x.id === documentoId);
  if (!d) throw new ErrorDemo("Documento no encontrado.", 404);
  insertarConfirmacion({ objetivo: `documento:${d.tipo}`, valorClave: d.id, considerados: [d.id], accion: "confirmar_documento", motivo: limpiarEspacios(motivo) || "Revisado por la persona.", procesoId, tramiteId: procesoTramite(procesoId) });
}

export function registrarExportacion(procesoId: string, estado: string, contenido: unknown) {
  getDb().prepare("INSERT INTO exportaciones (id, proceso_id, estado, generado_en, contenido_json) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), procesoId, estado, ahora(), JSON.stringify(contenido));
}

export function exportacionesDe(procesoId: string): { estado: string; generadoEn: string }[] {
  return (getDb().prepare("SELECT estado, generado_en FROM exportaciones WHERE proceso_id = ? ORDER BY generado_en").all(procesoId) as Fila[]).map((f) => ({ estado: String(f.estado), generadoEn: String(f.generado_en) }));
}

export function reiniciarDemo() {
  const db = getDb();
  db.exec("DELETE FROM exportaciones; DELETE FROM confirmaciones; DELETE FROM documentos; DELETE FROM valores; DELETE FROM registros_no_vinculados; DELETE FROM procesos; DELETE FROM fuentes; DELETE FROM expedientes;");
  asegurarExpediente();
}

let semillaRevisada = false;
/**
 * Solo en la versión en línea (Vercel): cada instancia arranca con una base vacía en /tmp,
 * así que se cargan las dos fuentes SINTÉTICAS de María para que el caso esté listo al abrir.
 */
export function sembrarDemoSiVacio() {
  if (semillaRevisada || !process.env.VERCEL) return;
  semillaRevisada = true;
  if (fuentesImportadas().length > 0) return;
  for (const nombre of ["sistema_antiguo_contribuyentes.csv", "exportacion_gestor_2025.json"]) {
    importarArchivo(nombre, new Uint8Array(readFileSyncSemilla(pathSemilla.join(process.cwd(), "muestras", nombre))));
  }
}
