import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, ExternalLink, Printer, ArrowRight, FileUp } from "lucide-react";
import { PanelFuentes } from "@/components/PanelFuentes";
import { FilaDato } from "@/components/FilaDato";
import { FilaPendiente, type Sugerencia } from "@/components/FilaPendiente";
import { Autorizar, ConfirmarTodos } from "@/components/BotonesProceso";
import { BarraAvance, ChipEstado } from "@/components/ui";
import { ESTADO_SALIDA } from "@/domain/exportar";
import { etiquetaConcepto } from "@/domain/conceptos";
import { ETIQUETA_FUENTE } from "@/domain/tipos";
import { agruparOpciones } from "@/domain/motor";
import { catalogo, evaluar, exportacionesDe, fuentesImportadas, tramite, valores } from "@/server/repo";

export const dynamic = "force-dynamic";

const PASOS = [
  { id: "fuentes", titulo: "Reutilizar expediente" },
  { id: "revisar", titulo: "Revisar información" },
  { id: "pendientes", titulo: "Completar pendientes" },
  { id: "preparar", titulo: "Preparar expediente" },
] as const;
type Paso = (typeof PASOS)[number]["id"];

export default async function PaginaTramite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paso?: string }> }) {
  const { id } = await params;
  const { paso: pasoParam } = await searchParams;
  if (!tramite(id)) notFound();
  const datos = evaluar(id);
  if (!datos) redirect("/");
  const { proceso, tramite: t, evaluacion: ev } = datos;
  const fuentes = fuentesImportadas();
  const aplicables = ev.requisitos.filter((r) => r.aplica !== false);
  const paraRevisar = aplicables.filter((r) => r.requisito.tipo === "dato" && r.opciones.length > 0 && !r.capturadoAqui).sort((a, b) => Number(b.estado === "en_conflicto") - Number(a.estado === "en_conflicto"));
  const pendientes = ev.requisitos.filter((r) => r.requisito.tipo === "documento" || (r.requisito.tipo === "dato" && (r.opciones.length === 0 || r.capturadoAqui)));
  const conflictos = ev.resumen.porEstado.en_conflicto;
  const disponibles = paraRevisar.filter((r) => r.estado === "disponible").length;
  const faltan = pendientes.filter((r) => r.aplica !== false && r.estado !== "confirmado_usuario").length;

  const pasoDefecto: Paso = !proceso.autorizado || fuentes.length === 0 ? "fuentes" : conflictos + disponibles > 0 ? "revisar" : faltan > 0 ? "pendientes" : "preparar";
  const paso: Paso = PASOS.some((p) => p.id === pasoParam) ? (pasoParam as Paso) : pasoDefecto;
  const otro = catalogo.tramites.find((x) => x.id !== t.id)!;
  const todos = valores();
  const sugerenciasDe = (relacionados: string[] | undefined): Sugerencia[] =>
    (relacionados ?? []).flatMap((c) => agruparOpciones(c, todos).slice(0, 1).map((o) => ({ concepto: c, valor: o.valor, origen: ETIQUETA_FUENTE[o.procedencias[0].fuente.tipo] })));
  const conteo: Record<Paso, number | null> = { fuentes: fuentes.length, revisar: conflictos + disponibles, pendientes: faltan, preparar: null };

  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">{t.institucion}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{t.nombre}</h1>
          <p className="mt-1 text-sm text-tinta-suave">Persona individual · expediente LA-DEMO-001</p>
        </div>
        <BarraAvance preparados={ev.resumen.preparados} aplicables={ev.resumen.aplicables} />
        <nav aria-label="Pasos del trámite">
          <ol className="space-y-1">
            {PASOS.map((p, i) => (
              <li key={p.id}>
                <Link href={`?paso=${p.id}`} aria-current={paso === p.id ? "step" : undefined}
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium ${paso === p.id ? "bg-marca text-black" : "hover:bg-superficie"}`}>
                  <span>{i + 1}. {p.titulo}</span>
                  {conteo[p.id] ? <span className={`rounded-full px-2 text-xs ${paso === p.id ? "bg-papel/20" : "bg-linea/60"}`}>{conteo[p.id]}</span> : null}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <section aria-live="polite" className="min-w-0 space-y-5">
        {!proceso.autorizado && ev.resumen.compatiblesSinAutorizar > 0 && (
          <Autorizar procesoId={proceso.id} tramite={t.nombre_corto} requisitos={ev.resumen.compatiblesSinAutorizar} />
        )}

        {paso === "fuentes" && (
          <>
            <PanelFuentes procesoId={proceso.id} fuentes={fuentes} />
            {proceso.autorizado && fuentes.length > 0 && (
              <Link href="?paso=revisar" className="boton boton-primario">Siguiente: revisar información <ArrowRight aria-hidden className="size-4" /></Link>
            )}
          </>
        )}

        {paso === "revisar" && (
          <>
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Revisa la información propuesta</h2>
                <p className="text-sm text-tinta-suave">{conflictos ? `Resuelve primero ${conflictos} diferencia${conflictos > 1 ? "s" : ""}. ` : ""}Abre «De…» para ver el campo y el valor original de cada fuente.</p>
              </div>
              <ConfirmarTodos procesoId={proceso.id} cuantos={disponibles} />
            </header>
            {paraRevisar.length === 0 ? (
              <p className="tarjeta p-5 text-sm">Todavía no hay datos propuestos. <Link className="underline" href="?paso=fuentes">Importa tus fuentes</Link>.</p>
            ) : (
              <ul className="space-y-3">{paraRevisar.map((r) => <FilaDato key={r.requisito.id} r={r} procesoId={proceso.id} />)}</ul>
            )}
            <Link href="?paso=pendientes" className="boton boton-primario">Siguiente: completar pendientes <ArrowRight aria-hidden className="size-4" /></Link>
          </>
        )}

        {paso === "pendientes" && (
          <>
            <header>
              <h2 className="text-xl font-bold">Completa solo lo que falta</h2>
              <p className="text-sm text-tinta-suave">Cada requisito explica por qué se pide y dónde se obtiene. Los que no aplican a tu caso se muestran para que sepas por qué.</p>
            </header>
            <ul className="space-y-3">
              {pendientes.map((r) => <FilaPendiente key={r.requisito.id} r={r} procesoId={proceso.id} sugerencias={r.estado === "faltante" ? sugerenciasDe(r.requisito.relacionados) : []} />)}
            </ul>
            <Link href="?paso=preparar" className="boton boton-primario">Siguiente: preparar expediente <ArrowRight aria-hidden className="size-4" /></Link>
          </>
        )}

        {paso === "preparar" && (
          <>
            <div className={`tarjeta p-5 sm:p-6 ${ev.resumen.estadoExpediente === "preparado_revision" ? "border-ok/50" : "border-aviso/50"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">Estado de la salida</p>
              <p className="mt-1 text-2xl font-bold">{ESTADO_SALIDA[ev.resumen.estadoExpediente]}</p>
              <p className="mt-2 text-sm text-tinta-suave">
                {ev.resumen.estadoExpediente === "preparado_revision"
                  ? "Todos los requisitos aplicables modelados están confirmados por ti. Ninguna institución lo ha verificado."
                  : `Quedan ${ev.resumen.aplicables - ev.resumen.preparados} requisito(s) pendientes. Puedes descargar el borrador igualmente.`}
              </p>
              {ev.resumen.tramiteAplica && ev.resumen.tramiteAplica.aplica === false && (
                <p className="mt-2 rounded-lg bg-aviso-fondo px-3 py-2 text-sm text-aviso">Con 0 trabajadores, según la fuente del IGSS la inscripción no es obligatoria: «{ev.resumen.tramiteAplica.texto}»</p>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[["Reutilizados", ev.resumen.reutilizados], ["Escritos aquí", ev.resumen.capturados], ["Pendientes", ev.resumen.aplicables - ev.resumen.preparados], ["Aplicables", ev.resumen.aplicables]].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg bg-papel p-3"><dt className="text-xs text-tinta-suave">{k}</dt><dd className="text-2xl font-bold">{v}</dd></div>
                ))}
              </dl>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <a href={`/api/exportar/${t.id}`} className="boton boton-primario"><Download aria-hidden className="size-4" /> Descargar expediente preparado</a>
                <Link href={`/tramite/${t.id}/resumen`} className="boton boton-secundario"><Printer aria-hidden className="size-4" /> Resumen imprimible</Link>
              </div>
              {exportacionesDe(proceso.id).length > 0 && <p className="mt-2 text-xs text-tinta-suave">Descargas registradas: {exportacionesDe(proceso.id).length}. Última: {exportacionesDe(proceso.id).at(-1)!.estado}.</p>}
            </div>

            <div className="tarjeta p-5">
              <h3 className="font-bold">Requisitos del catálogo de la demo</h3>
              <ul className="mt-3 divide-y divide-linea">
                {ev.requisitos.map((r) => (
                  <li key={r.requisito.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{r.requisito.titulo}{r.elegida ? <span className="text-tinta-suave"> · {r.elegida.valor}</span> : null}{r.reutilizado && r.aplica !== false ? <span className="ml-2 rounded bg-marca-clara px-1.5 text-xs text-marca">reutilizado</span> : null}</span>
                    <ChipEstado estado={r.aplica === false ? "no_aplica" : r.estado} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="tarjeta p-5">
              <h3 className="font-bold">Siguiente paso oficial (fuera de Lazô)</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{t.pasos_oficiales.map((p) => <li key={p.texto}>{p.texto}</li>)}</ol>
              <a href={t.canal_oficial_url} target="_blank" rel="noreferrer" className="boton boton-secundario boton-chico mt-3">Abrir canal oficial <ExternalLink aria-hidden className="size-4" /></a>
            </div>

            {t.id === "rm-comerciante-empresa" && (
              <div className="tarjeta border-dashed p-5">
                <h3 className="flex items-center gap-2 font-bold"><FileUp aria-hidden className="size-5 text-marca" /> Etapa posterior: documentos obtenidos después</h3>
                <p className="mt-1 text-sm">Para continuar con {otro.nombre_corto}, carga la patente y la constancia de RTU que obtuviste por los canales oficiales. En la demo son archivos sintéticos: Lazô no los emite ni los verifica.</p>
                <Link href="/expediente#documentos" className="boton boton-secundario boton-chico mt-3">Cargar documentos obtenidos previamente</Link>
              </div>
            )}
          </>
        )}
        <p className="text-xs text-tinta-suave">Catálogo {catalogo.version}, revisado el {catalogo.revisado_en}. Datos de identificación distintos: {etiquetaConcepto("persona.cui")} ≠ {etiquetaConcepto("persona.nit")}.</p>
      </section>
    </div>
  );
}
