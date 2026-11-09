/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@gestlog/ui', '@gestlog/shared'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
