import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev indicator clear of the admin console's left sidebar.
  devIndicators: {
    position: "bottom-right", // Moves badge away from left sidebar
  },
};

export default nextConfig;
