/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@gestlog/ui', '@gestlog/shared'],
  typedRoutes: true,
};

export default nextConfig;
