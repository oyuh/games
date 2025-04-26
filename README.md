# Games App

A web app for playing party games with friends! Users must enter a name to join or create games. Include (for now):

- **Imposter**: Blend in or find the imposter! Players receive similar words, take turns giving clues, and vote to find the imposter.
- **Password**: Team-based word guessing. Give clues, guess the word, and beat the other team.

## Features
- Join or create games with a code
- Real-time game state and player management
- Session modal ensures every player enters a name before playing

## Getting Started
1. Install dependencies:
   ```sh
   pnpm install
   ```
2. Start the database (see `start-database.sh`).
3. Run the development server:
   ```sh
   pnpm dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack
- Next.js (App Router)
- React
- Drizzle ORM & PostgreSQL
- Tailwind CSS

## License
MIT
