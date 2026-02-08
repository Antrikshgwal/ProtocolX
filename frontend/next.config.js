/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@langchain/google-genai",
      "@langchain/core",
    ],
  },
};

module.exports = nextConfig;
