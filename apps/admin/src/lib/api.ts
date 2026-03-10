const API_URL = process.env.GAMES_API_URL ?? "http://localhost:3001";
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

export async function adminFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_SECRET}`,
      ...options.headers,
    },
  });
}
