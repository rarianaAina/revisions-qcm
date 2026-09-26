import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le driver Postgres est natif côté Node : il ne doit pas être empaqueté.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
