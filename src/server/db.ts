import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

let db: DatabaseSync | null = null;

export function rutaDb(): string {
  if (process.env.LEGACYARCHIVE_DB_PATH) return process.env.LEGACYARCHIVE_DB_PATH;
  // En Vercel el disco del proyecto es de solo lectura: la base vive en /tmp y no persiste.
  if (process.env.VERCEL) return "/tmp/lazo/legacyarchive.db";
  return path.join(process.cwd(), "data", "legacyarchive.db");
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const ruta = rutaDb();
  if (ruta !== ":memory:") mkdirSync(path.dirname(ruta), { recursive: true });
  db = new DatabaseSync(ruta);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrar(db);
  return db;
}

/** Solo para pruebas: cierra y olvida la conexión para simular reabrir la app. */
export function cerrarDb() {
  db?.close();
  db = null;
}

function migrar(d: DatabaseSync) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS expedientes (
      id TEXT PRIMARY KEY, ref TEXT NOT NULL, creado_en TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fuentes (
      id TEXT PRIMARY KEY, expediente_id TEXT NOT NULL REFERENCES expedientes(id),
      nombre_archivo TEXT NOT NULL, tipo TEXT NOT NULL, sha256 TEXT, importado_en TEXT NOT NULL,
      total_filas INTEGER, vinculados INTEGER, errores_json TEXT
    );
    CREATE TABLE IF NOT EXISTS registros_no_vinculados (
      id TEXT PRIMARY KEY, fuente_id TEXT NOT NULL REFERENCES fuentes(id),
      ref TEXT, nombre TEXT, decision TEXT NOT NULL, motivo TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS procesos (
      id TEXT PRIMARY KEY, expediente_id TEXT NOT NULL REFERENCES expedientes(id),
      tramite_id TEXT NOT NULL, tipo_solicitante TEXT NOT NULL, abierto_en TEXT NOT NULL,
      autorizado INTEGER NOT NULL DEFAULT 0, autorizado_en TEXT,
      UNIQUE (expediente_id, tramite_id)
    );
    CREATE TABLE IF NOT EXISTS valores (
      id TEXT PRIMARY KEY, expediente_id TEXT NOT NULL REFERENCES expedientes(id),
      concepto TEXT NOT NULL, valor TEXT NOT NULL, valor_original TEXT NOT NULL, campo_origen TEXT NOT NULL,
      fecha_dato TEXT, importado_en TEXT NOT NULL, fuente_id TEXT NOT NULL REFERENCES fuentes(id), proceso_id TEXT
    );
    CREATE TABLE IF NOT EXISTS documentos (
      id TEXT PRIMARY KEY, expediente_id TEXT NOT NULL REFERENCES expedientes(id),
      tipo TEXT NOT NULL, nombre_archivo TEXT NOT NULL, fecha_emision TEXT, aportado_en TEXT NOT NULL,
      proceso_id TEXT, sha256 TEXT NOT NULL, tamano INTEGER NOT NULL, contenido BLOB NOT NULL, nota TEXT
    );
    CREATE TABLE IF NOT EXISTS confirmaciones (
      id TEXT PRIMARY KEY, expediente_id TEXT NOT NULL REFERENCES expedientes(id),
      objetivo TEXT NOT NULL, valor_clave TEXT NOT NULL, considerados_json TEXT NOT NULL,
      accion TEXT NOT NULL, motivo TEXT NOT NULL, autor TEXT NOT NULL, fecha TEXT NOT NULL,
      proceso_id TEXT, tramite_id TEXT
    );
    CREATE TABLE IF NOT EXISTS exportaciones (
      id TEXT PRIMARY KEY, proceso_id TEXT NOT NULL REFERENCES procesos(id),
      estado TEXT NOT NULL, generado_en TEXT NOT NULL, contenido_json TEXT NOT NULL
    );
  `);
}
