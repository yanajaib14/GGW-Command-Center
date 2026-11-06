import { getAuth } from "@/server/auth/neon";

// Proxies the browser auth client's requests to the Neon Auth server.
// Handlers are created on the first request so `next build` needs no env.

type Handlers = ReturnType<ReturnType<typeof getAuth>["handler"]>;
let handlers: Handlers | undefined;
const h = (): Handlers => (handlers ??= getAuth().handler());

export const GET: Handlers["GET"] = (req, ctx) => h().GET(req, ctx);
export const POST: Handlers["POST"] = (req, ctx) => h().POST(req, ctx);
export const PUT: Handlers["PUT"] = (req, ctx) => h().PUT(req, ctx);
export const DELETE: Handlers["DELETE"] = (req, ctx) => h().DELETE(req, ctx);
export const PATCH: Handlers["PATCH"] = (req, ctx) => h().PATCH(req, ctx);
