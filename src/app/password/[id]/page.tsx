import { notFound } from "next/navigation";
import { db } from "~/server/db";
import { password } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { Button } from "~/components/ui/button";
import Link from "next/link";

export default async function PasswordPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const game = await db.query.password.findFirst({
      where: eq(password.id, params.id),
    });

    if (!game) {
      return notFound();
    }

    return (
      <div className="container flex flex-col items-center justify-center">
        <h1 className="mb-4 text-4xl font-bold">Password Game</h1>
        <div className="mb-4 text-xl">Game Code: {game.code}</div>

        {!game.started_at && (
          <div className="mb-4">
            <p className="mb-2">Waiting for players to join...</p>
            <Link href={`/password/${params.id}/begin`}>
              <Button>Begin Game</Button>
            </Link>
          </div>
        )}

        {game.started_at && !game.finished_at && (
          <div>
            <p className="mb-4">Game in progress!</p>
            {/* Game in progress UI will be implemented here */}
          </div>
        )}

        {game.finished_at && (
          <div>
            <p className="mb-4">Game completed!</p>
            <Link href={`/password/${params.id}/results`}>
              <Button>View Results</Button>
            </Link>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("Error loading password game:", error);
    return <div>Error loading game. Please try again.</div>;
  }
}
