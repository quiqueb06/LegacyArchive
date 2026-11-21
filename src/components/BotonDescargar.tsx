"use client";
import { Download } from "lucide-react";
import { useState } from "react";
import { descargarExpediente } from "@/app/acciones";

export function BotonDescargar({ tramiteId }: { tramiteId: string }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <a href={`/api/exportar/${tramiteId}`} role="link" className="boton boton-primario" aria-disabled={ocupado}
        onClick={async (e) => {
          e.preventDefault();
          setOcupado(true);
          setError(null);
          try {
            const r = await descargarExpediente(tramiteId);
            if (!r.ok) { setError(r.texto); return; }
            const url = URL.createObjectURL(new Blob([r.texto], { type: "application/json" }));
            const a = document.createElement("a");
            a.href = url; a.download = r.nombre; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          } finally {
            setOcupado(false);
          }
        }}>
        <Download aria-hidden className="size-4" /> Descargar expediente preparado
      </a>
      {error && <p role="alert" className="text-sm text-alerta">{error}</p>}
    </>
  );
}
