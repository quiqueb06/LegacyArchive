import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite es un módulo nativo de Node; se usa solo en el servidor.
  serverExternalPackages: [],
  poweredByHeader: false,
  // Las muestras sintéticas se leen del disco en el servidor; incluirlas en el despliegue.
  outputFileTracingIncludes: { "/**/*": ["./muestras/**/*"] },
};

export default nextConfig;
