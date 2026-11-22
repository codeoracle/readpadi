/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // We don't use next/image optimisation; keep the server function small for Netlify.
  images: { unoptimized: true },
  outputFileTracingExcludes: {
    "*": ["node_modules/@img/**", "node_modules/sharp/**", "node_modules/pdfjs-dist/**", "node_modules/typescript/**", "node_modules/@netlify/plugin-nextjs/**"],
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
export default nextConfig;
