/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
    typescript: {
        // !! WARN !!
        ignoreBuildErrors: true,
      },
      eslint: {
        // !! WARN !!
        ignoreDuringBuilds: true,
    },
};

export default config;
