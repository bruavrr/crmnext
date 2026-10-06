import { defineConfig } from "vitest/config";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error(
    "TEST_DATABASE_URL doit pointer vers une base dédiée terminant par _test",
  );
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
