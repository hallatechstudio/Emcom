/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const s3 = process.env.NEXT_PUBLIC_MEDIA_ORIGIN ?? 'http://localhost:9000';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@emcom/api-client', '@emcom/shared-types'],
  poweredByHeader: false,
  async headers() {
    const csp = [
      "default-src 'self'",
      `connect-src 'self' ${apiUrl} ${apiUrl.replace(/^http/, 'ws')}`,
      `img-src 'self' data: blob: ${s3}`,
      `media-src 'self' ${s3}`,
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
