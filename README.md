# Games! 🎲

[![Next.js](https://img.shields.io/badge/Next.js-15-blue?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-0.41-blue?logo=drizzle)](https://orm.drizzle.team/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-blue?logo=tailwindcss)](https://tailwindcss.com/)
[![Postgres](https://img.shields.io/badge/Postgres-3.4-blue?logo=postgresql)](https://www.postgresql.org/)
[![Vercel Analytics](https://img.shields.io/badge/Vercel_Analytics-1.5-blue?logo=vercel)](https://vercel.com/analytics)

---

## Overview

**Games!** is a multiplayer party game platform built with Next.js, React, Drizzle ORM, and PostgreSQL. It allows users to create, join, and play a variety of social games in real time, with a focus on word and deduction games. The app features robust session management, team logic, and real-time updates via polling.

---

## Table of Contents

- [Games! 🎲](#games-)
  - [Overview](#overview)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Games](#games)
    - [Imposter](#imposter)
    - [Password](#password)
  - [Pages \& Navigation](#pages--navigation)
  - [API Routes](#api-routes)
    - [Common](#common)
    - [Imposter](#imposter-1)
    - [Password](#password-1)
  - [Database](#database)
  - [Tech Stack](#tech-stack)
  - [Development](#development)
    - [Prerequisites](#prerequisites)
    - [Setup](#setup)

---

## Features

- Create and join game lobbies with unique codes
- Real-time updates and polling for game state
- Team assignment and management
- Host controls (start/end game, manage teams)
- Player session management
- Game-specific logic for each supported game
- Responsive UI with Tailwind CSS
- Social and info links in the UI

---

## Games

### Imposter

A social deduction game where players give clues to a secret word. One or more players are imposters who don't know the word and must blend in. After clues are given, players vote to find the imposter(s).

**Key Mechanics:**
- Host selects category and starts the game.
- Each round, players submit clues in turn.
- After all clues, players vote on who they think is the imposter.
- If all imposters are found, non-imposters win; otherwise, imposters win.

### Password

A team-based word guessing game. Teams of two compete to guess secret words based on one-word clues.

**Key Mechanics:**
- Players join and are assigned to teams of two.
- Each round, teams select a category and a word.
- One player gives a one-word clue, the other guesses.
- Teams score points for correct guesses; first to reach the target wins.

---

## Pages & Navigation

- `/`
  **Home page**: Game selection, create/join game forms, info dialogs.

- `/imposter/[id]`
  **Imposter game lobby and gameplay**: Wait for players, start game, submit clues, vote, see results.

- `/password/[id]/begin`
  **Password game lobby**: Assign teams, wait for players, host starts game.

- `/password/[id]`
  **Password gameplay**: Team clue-giving and guessing, round progress, scores.

- `/password/[id]/results`
  **Password results**: Final scores, round-by-round summary.

---

## API Routes

All API routes are under `/api/` and use Next.js Route Handlers.

### Common

- `/api/cleanup`
  Cleans up expired games and sessions (cron job).

### Imposter

- `/api/imposter/create`
  Create a new imposter game.

- `/api/imposter/[id]`
  Get game state.

- `/api/imposter/[id]/start`
  Host starts the game.

- `/api/imposter/[id]/clue`
  Submit a clue.

- `/api/imposter/[id]/vote`
  Submit a vote.

- `/api/imposter/[id]/should-vote`
  Vote on whether to proceed to voting phase.

- `/api/imposter/[id]/heartbeat`
  Player heartbeat for connection tracking.

- `/api/imposter/[id]/leave`
  Leave the game.

### Password

- `/api/password/create`
  Create a new password game.

- `/api/password/join-by-code/[code]`
  Join a game by code.

- `/api/password/[id]`
  Get game state.

- `/api/password/[id]/start`
  Host starts the game.

- `/api/password/[id]/clue`
  Submit a clue.

- `/api/password/[id]/guess`
  Submit a guess.

- `/api/password/[id]/vote-category`
  Vote for a category.

- `/api/password/[id]/select-word`
  Select the word for the round.

- `/api/password/[id]/next-round`
  Host starts the next round.

- `/api/password/[id]/end-round`
  Host ends the round and calculates scores.

- `/api/password/[id]/end-game`
  Host ends the game and sets winners.

- `/api/password/[id]/leave`
  Leave the game.

- `/api/password/[id]/team/team-leave`
  Leave a team (but stay in the game).

---

## Database

- **Tables:**
  - `imposter` (imposter game state)
  - `password` (password game state)
  - `sessions` (player sessions)

- **ORM:**
  Uses Drizzle ORM for type-safe queries and migrations.

---

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS 4
- **Backend:** Next.js Route Handlers (API), Drizzle ORM, PostgreSQL
- **State:** React hooks, polling for real-time updates
- **Other:**
  - `string-similarity` for clue validation
  - `lodash.shuffle` for randomization
  - Vercel Analytics

---

## Development

### Prerequisites

- Node.js 20+
- pnpm (or npm/yarn)
- PostgreSQL database

### Setup

1. **Install dependencies:**
   ```sh
   pnpm install
   ```

2. **Configure enviroment:**
    - Copy `.env.example` to `.env` and fill in database creds and secrets.

3. **Run database migrations**
    ```sh
    pnpm db:push
    ```

4. **Run database migrations**
    ```sh
    pnpm dev
    ```

5. **Run database migrations**
    ```sh
    pnpm build
    pnpm start
    ```
