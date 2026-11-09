/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@gestlog/ui', '@gestlog/shared'],
};

export default nextConfig;
