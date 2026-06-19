import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Cloud Run / Docker image small.
  output: "standalone",
  // Server-only packages that should not be bundled by Turbopack/webpack.
  serverExternalPackages: ["@prisma/client", "prisma", "bcryptjs", "mammoth", "unpdf", "xlsx"],
  experimental: {
    // Allow evidence file uploads through Server Actions.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
