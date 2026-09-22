import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev indicator clear of the admin console's left sidebar.
  devIndicators: {
    position: "bottom-right", // Moves badge away from left sidebar
  },
  images: {
    // Report evidence lives on Cloudinary once CLOUDINARY_* is configured —
    // allow its CDN through the image optimizer.
    remotePatterns: [new URL("https://res.cloudinary.com/**")],
  },
};

export default nextConfig;
