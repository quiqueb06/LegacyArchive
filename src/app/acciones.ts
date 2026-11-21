"use server";
/**
 * Todas las acciones pasan por aquí como Server Actions. Así se ejecutan en la misma
 * función que dibuja las páginas; en Vercel, las rutas /api viven en otra función con
 * su propio /tmp y no verían el expediente.
 */
import { POST as autorizar } from "./api/autorizar/route";
import { POST as capturar } from "./api/capturar/route";
import { POST as confirmarTodos } from "./api/confirmar-todos/route";
import { POST as confirmar } from "./api/confirmar/route";
import { POST as croma } from "./api/croma/route";
import { POST as documentosConfirmar } from "./api/documentos/confirmar/route";
import { POST as documentos } from "./api/documentos/route";
import { GET as exportar } from "./api/exportar/[tramiteId]/route";
import { POST as importarDemo } from "./api/importar-demo/route";
import { POST as importar } from "./api/importar/route";
import { POST as procesos } from "./api/procesos/route";
import { POST as reiniciar } from "./api/reiniciar/route";

const MAPA: Record<string, (req: Request) => Promise<Response>> = {
  "/api/autorizar": autorizar,
  "/api/capturar": capturar,
  "/api/confirmar-todos": confirmarTodos,
  "/api/confirmar": confirmar,
  "/api/croma": croma,
  "/api/documentos/confirmar": documentosConfirmar,
  "/api/documentos": documentos,
  "/api/importar-demo": importarDemo,
  "/api/importar": importar,
  "/api/procesos": procesos,
  "/api/reiniciar": () => reiniciar(),
};

export async function ejecutarAccion(ruta: string, cuerpo: unknown): Promise<Record<string, unknown>> {
  const manejador = MAPA[ruta];
  if (!manejador) return { ok: false, error: "Acción desconocida." };
  const url = `http://lazo.local${ruta}`;
  const req = cuerpo instanceof FormData
    ? new Request(url, { method: "POST", body: cuerpo })
    : new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo ?? {}) });
  const res = await manejador(req);
  return res.json().catch(() => ({ ok: false, error: "Respuesta inválida del servidor." }));
}

export async function descargarExpediente(tramiteId: string): Promise<{ ok: boolean; texto: string; nombre: string }> {
  const res = await exportar(new Request(`http://lazo.local/api/exportar/${tramiteId}`), { params: Promise.resolve({ tramiteId }) });
  const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `expediente-${tramiteId}.json`;
  return { ok: res.ok, texto: await res.text(), nombre };
}
