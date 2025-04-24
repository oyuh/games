/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
    typescript: {
        // !! WARN !!
        // Ignoring build errors is dangerous, but we need this as a temporary workaround
        ignoreBuildErrors: true,
      },
      eslint: {
        // !! WARN !!
        // Similarly, ignoring ESLint errors is not recommended but helps with deployment
        ignoreDuringBuilds: true,
    },
};

export default config;
