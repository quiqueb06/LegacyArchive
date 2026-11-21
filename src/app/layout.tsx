import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource-variable/public-sans";
import "./globals.css";
import { sembrarDemoSiVacio } from "@/server/repo";

export const metadata: Metadata = {
  title: "Lazô · Demo Guatemala",
  description: "Prepara expedientes del Registro Mercantil y del IGSS reutilizando información, con datos sintéticos.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7efe6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  sembrarDemoSiVacio();
  return (
    <html lang="es-GT">
      <body className="min-h-dvh">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 boton boton-secundario">Saltar al contenido</a>
        <div className="no-imprimir bg-tinta text-papel text-sm">
          <p className="mx-auto max-w-6xl px-4 py-2">
            <strong className="font-semibold">Demo con datos sintéticos.</strong> No se conecta con Registro Mercantil, SAT, RENAP ni IGSS. Nada aquí es una inscripción presentada ni aprobada.{process.env.VERCEL ? " En esta versión en línea los datos no se guardan de forma permanente." : null}
          </p>
        </div>
        <header className="no-imprimir sticky top-0 z-40 border-b border-linea bg-papel/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2" aria-label="Lazô, inicio">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/lazo-logo.svg" alt="" width={76} height={36} className="h-9 w-auto" />
            </Link>
            <nav aria-label="Principal" className="flex gap-1 text-sm font-medium">
              <Link className="rounded-md px-3 py-2 hover:bg-superficie" href="/">Trámites</Link>
              <Link className="rounded-md px-3 py-2 hover:bg-superficie" href="/expediente">Mi expediente</Link>
              <Link className="rounded-md px-3 py-2 hover:bg-superficie" href="/catalogo">Catálogo</Link>
            </nav>
          </div>
        </header>
        <main id="contenido" className="mx-auto max-w-6xl px-4 py-6 sm:py-10">{children}</main>
      </body>
    </html>
  );
}
