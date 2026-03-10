export async function api(
  path: string,
  options: { method?: string; body?: unknown } = {}
) {
  const method = options.method ?? "GET";
  const url = `/api/proxy?path=${encodeURIComponent(path)}`;

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `API error ${res.status}`);
  return data;
}
