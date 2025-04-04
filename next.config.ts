import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn2.suno.ai",
        port: "",
        pathname: "/**",
      },{
        protocol:"https",
        hostname:"tempfile.aiquickdraw.com",
        port:"",
        pathname:"/**"
      },
      {
        protocol: "https",
        hostname: "assets.aceternity.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol:"https",
        hostname:"apiboxfiles.erweima.ai",
        port:"",
        pathname:"/**"
      }
    ],
  },
};

export default nextConfig;
