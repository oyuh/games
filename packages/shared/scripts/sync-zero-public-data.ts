import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const { Client } = pg;

type ImposterPlayer = {
  sessionId: string;
  name: string | null;
  connected: boolean;
  role?: "imposter" | "player";
  eliminated?: boolean;
};

type ImposterRoundHistoryEntry = {
  round: number;
  secretWord: string | null;
  votedOutId: string | null;
  votedOutName: string | null;
  wasImposter: boolean;
  clues: Array<{ sessionId: string; text: string }>;
  votes: Array<{ voterId: string; targetId: string }>;
};

function redactPlayers(phase: string, players: ImposterPlayer[]) {
  if (phase === "results" || phase === "finished" || phase === "ended") {
    return players;
  }
  return players.map(({ role: _role, ...player }) => player);
}

function redactRoundHistory(phase: string, roundHistory: ImposterRoundHistoryEntry[]) {
  if (phase === "results" || phase === "finished" || phase === "ended") {
    return roundHistory;
  }
  return roundHistory.map((entry) => ({ ...entry, secretWord: null }));
}

function redactSecretWord(phase: string, secretWord: string | null) {
  if (!secretWord) return null;
  if (phase === "results" || phase === "finished" || phase === "ended") {
    return secretWord;
  }
  return secretWord.startsWith("enc:") ? secretWord : null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim() || "postgres://postgres:postgres@localhost:5432/games";
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("begin");

    const result = await client.query(`
      select
        id,
        code,
        host_id,
        phase,
        category,
        secret_word,
        players,
        clues,
        votes,
        spectators,
        kicked,
        round_history,
        announcement,
        settings,
        is_public,
        created_at,
        updated_at
      from imposter_games
    `);

    for (const row of result.rows) {
      const phase = row.phase as string;
      const players = (row.players ?? []) as ImposterPlayer[];
      const roundHistory = (row.round_history ?? []) as ImposterRoundHistoryEntry[];

      await client.query(
        `insert into imposter_public_games (
          id, code, host_id, phase, category, secret_word, players, clues, votes, spectators,
          kicked, round_history, announcement, settings, is_public, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
          $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17
        )
        on conflict (id) do update set
          code = excluded.code,
          host_id = excluded.host_id,
          phase = excluded.phase,
          category = excluded.category,
          secret_word = excluded.secret_word,
          players = excluded.players,
          clues = excluded.clues,
          votes = excluded.votes,
          spectators = excluded.spectators,
          kicked = excluded.kicked,
          round_history = excluded.round_history,
          announcement = excluded.announcement,
          settings = excluded.settings,
          is_public = excluded.is_public,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`,
        [
          row.id,
          row.code,
          row.host_id,
          row.phase,
          row.category,
          redactSecretWord(phase, row.secret_word),
          JSON.stringify(redactPlayers(phase, players)),
          JSON.stringify(row.clues ?? []),
          JSON.stringify(row.votes ?? []),
          JSON.stringify(row.spectators ?? []),
          JSON.stringify(row.kicked ?? []),
          JSON.stringify(redactRoundHistory(phase, roundHistory)),
          JSON.stringify(row.announcement ?? null),
          JSON.stringify(row.settings ?? {}),
          row.is_public,
          row.created_at,
          row.updated_at,
        ]
      );
    }

    await client.query(`
      delete from imposter_public_games
      where id not in (select id from imposter_games)
    `);

    await client.query("commit");
    console.log(`[db:sync-zero-public-data] synced ${result.rows.length} imposter public rows`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

await main();
