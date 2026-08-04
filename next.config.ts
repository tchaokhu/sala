import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Property photos travel inside the createProperty action rather than
      // going up from the browser (ADR 0007), so a submission is one request
      // body. lib/property-input.ts caps that batch at 20 MB; this sits above
      // it, and has to move if that cap does. The default is 1 MB, which two
      // photos from a phone already exceed.
      bodySizeLimit: "24mb",
    },
  },
};

export default nextConfig;
