// Bun loads .env files natively, so no dotenv/config import is needed here
// (this project's backend always runs via `bun`/`bunx`, never plain node).
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
