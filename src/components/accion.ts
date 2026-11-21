"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ejecutarAccion } from "@/app/acciones";

/** Llama a un endpoint, muestra el error si lo hay y refresca la vista del servidor. */
export function useAccion() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [refrescando, startTransition] = useTransition();

  async function ejecutar(url: string, cuerpo?: unknown): Promise<Record<string, unknown> | null> {
    setError(null);
    setEnviando(true);
    try {
      const datos = (await ejecutarAccion(url, cuerpo)) as { ok?: boolean; error?: string } & Record<string, unknown>;
      if (!datos.ok) {
        setError(datos.error ?? "No se pudo completar la acción.");
        return null;
      }
      startTransition(() => router.refresh());
      return datos;
    } catch {
      setError("No hay conexión con el servidor de la demo. Revisa que siga en ejecución y vuelve a intentarlo.");
      return null;
    } finally {
      setEnviando(false);
    }
  }

  return { ejecutar, error, setError, ocupado: enviando || refrescando };
}
