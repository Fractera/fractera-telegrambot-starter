import type { NextConfig } from "next";

const basePath = process.env.IS_DEMO === "1" ? "/demo" : "";

const nextConfig: NextConfig = {
  ...(basePath
    ? {
        assetPrefix: "/demo-assets",
        basePath,
        redirects: async () => [
          {
            basePath: false,
            destination: basePath,
            permanent: false,
            source: "/",
          },
        ],
      }
    : {}),
  cacheComponents: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  experimental: {
    appNewScrollHandler: true,
    cachedNavigations: true,
    inlineCss: true,
    prefetchInlining: true,
    turbopackFileSystemCacheForDev: true,
  },
  // 🪦 `images.remotePatterns` С ДОМЕНАМИ VERCEL УБРАНЫ ТОГДА ЖЕ: `avatar.vercel.sh`
  // и `*.public.blob.vercel-storage.com` — склады чужого шаблона. Файлы проекта
  // лежат в медиатере слоя данных и отдаются своим маршрутом.
  logging: {
    fetches: {
      fullUrl: false,
    },
    incomingRequests: false,
  },
  poweredByHeader: false,
  reactCompiler: true,
};

// 🪦 ОБЁРТКА `withBotId` УБРАНА 2026-09-06 ВМЕСТЕ С ПАКЕТОМ `botid`. Это
// продукт Vercel, защищавший `/api/chat` шаблона; ни маршрута, ни Vercel у нас
// нет. ✗ И ЭТО МЕСТО Я ПРОПУСТИЛ: искал `botid` по `app`, `lib`, `components`,
// `providers` — и не заглянул в конфиг сборки. Сборка упала на сервере с
// `Cannot find module 'botid/next/config'`. Урок: удаляя пакет, ищи его по
// ВСЕМУ дереву, а не по папкам с кодом — конфиги тоже импортируют.
export default nextConfig;
