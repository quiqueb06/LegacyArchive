import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, PlayCircle } from "lucide-react";
import { IniciarTramite } from "@/components/IniciarTramite";
import { procesoPorTramite, tramite } from "@/server/repo";

export const dynamic = "force-dynamic";

const EXPLICACION: Record<string, { resumen: string; pasos: string[] }> = {
  "rm-comerciante-empresa": {
    resumen: "Sirve para inscribirte como comerciante individual e inscribir tu empresa. Al final obtienes la patente de comercio.",
    pasos: ["Respondes tres preguntas.", "Traemos tus datos de los sistemas donde ya están.", "Revisas, completas lo que falta y descargas tu expediente."],
  },
  "igss-inscripcion-patronal": {
    resumen: "Si tu negocio tiene uno o más trabajadores, debes inscribirte como patrono en el IGSS.",
    pasos: ["Respondes una pregunta.", "Usamos lo que ya preparaste para el Registro Mercantil.", "Completas lo que falta y descargas tu expediente."],
  },
};

export default async function InicioTramite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = tramite(id);
  if (!t) notFound();
  const abierto = !!procesoPorTramite(id);
  const info = EXPLICACION[id];
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/" className="inline-flex min-h-11 items-center gap-1 text-[17px] text-marca"><ChevronLeft aria-hidden className="size-5" /> Trámites</Link>
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-tinta-suave">{t.institucion}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight">{t.nombre}</h1>
        {info && <p className="mt-2 text-lg text-tinta-suave">{info.resumen}</p>}
      </header>

      <section aria-labelledby="t-video">
        <h2 id="t-video" className="sr-only">Video explicativo</h2>
        <div className="relative grid aspect-video w-full max-w-full place-items-center overflow-hidden rounded-3xl border border-linea bg-superficie text-tinta">
          <div aria-hidden className="degradado-lazo absolute inset-x-0 top-0 h-1.5" />
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <PlayCircle aria-hidden className="size-16 text-marca" strokeWidth={1.25} />
            <p className="text-lg font-semibold">Cómo hacer este trámite</p>
            <p className="text-sm text-tinta-suave">Video de ejemplo pendiente de grabar. No es un video oficial.</p>
          </div>
          <span className="absolute left-3 top-3 rounded-full bg-marca px-2.5 text-black py-1 text-xs font-semibold">Ejemplo</span>
        </div>
        {info && (
          <ol className="mt-4 space-y-2">
            {info.pasos.map((p, i) => (
              <li key={p} className="flex items-start gap-3 text-[17px]">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-marca-clara text-sm font-semibold text-marca">{i + 1}</span>
                {p}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-2xl bg-superficie p-5 sm:p-6" aria-labelledby="t-preguntas">
        <h2 id="t-preguntas" className="mb-4 text-xl font-bold">{abierto ? "Ya empezaste este trámite" : "Antes de empezar"}</h2>
        <IniciarTramite tramiteId={t.id} preguntaInscrita={t.id === "rm-comerciante-empresa"} abierto={abierto} />
      </section>

      <a href={t.canal_oficial_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-[15px] text-marca">
        Ver la información oficial de {t.nombre_corto} <ExternalLink aria-hidden className="size-4" />
      </a>
    </div>
  );
}
