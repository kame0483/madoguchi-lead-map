// Copy to access-config.ts in a private deployment workspace. Never commit that file.
export const ACCESS_HASH = Deno.env.get("LEAD_MAP_ACCESS_HASH") || "";
