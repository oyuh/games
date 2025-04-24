// Override Next.js route handler types to fix type incompatibilities
import { NextRequest } from "next/server";

declare module "next/dist/server/app-route/route-handlers" {
  export interface RouteHandlerContext {
    params: Record<string, string | string[]>;
  }

  export interface RouteHandler {
    (request: NextRequest, context: { params: Record<string, string | string[]> }): Promise<Response> | Response;
  }
}
