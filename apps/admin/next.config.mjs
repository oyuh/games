import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.join(__dirname, "../../");

/** @type {import('next').NextConfig} */
const nextConfig = {
	outputFileTracingRoot: workspaceRoot,
	turbopack: {
		root: workspaceRoot,
	},
};

export default nextConfig;
