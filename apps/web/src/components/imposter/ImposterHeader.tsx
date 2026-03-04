import { Badge } from "flowbite-react";

export function ImposterHeader({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">Imposter</h1>
      <Badge color="info">Code: {code}</Badge>
    </div>
  );
}
