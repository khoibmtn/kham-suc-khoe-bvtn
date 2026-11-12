import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Mốc phiên bản = lúc build; client so sánh mỗi 60 giây để báo "có bản cập nhật mới".
  env: { NEXT_PUBLIC_APP_VERSION: new Date().toISOString() },
};

export default nextConfig;
