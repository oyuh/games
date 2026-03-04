import { Badge } from "flowbite-react";

export function PasswordHeader({ title, code }: { title: string; code: string }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Badge color="info">Code: {code}</Badge>
    </div>
  );
}
