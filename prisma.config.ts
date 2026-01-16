import { defineConfig } from "prisma/config";
import { config } from "dotenv";

// Load .env file manually since Prisma config skips auto-loading
config();

// For build time (prisma generate), DATABASE_URL is not required
// Prisma generate only needs the schema, not a database connection
// Use a dummy URL for build time if DATABASE_URL is not set
const datasourceUrl = process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy';

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: datasourceUrl,
  },
});
