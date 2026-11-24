// Creates (or promotes) an administrator. Run once after the first deployment:
//   npm run user:create-admin -- --email=you@example.com [--name="Your name"]
// The administrator then signs in with the emailed code like any other user.
import { parseArgs } from "node:util";
import { loadConfig } from "../config.js";
import { createDatabaseClient } from "../db/client.js";
import { defaultDisplayName, normalizeEmail } from "../security/email.js";
import { assignRoles, createUser, findUserByEmail } from "../services/users.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
    },
  });

  const email = values.email ? normalizeEmail(values.email) : null;
  if (!email) {
    throw new Error("A valid --email argument is required");
  }

  const config = loadConfig();
  const database = createDatabaseClient(config.DATABASE_URL, 1);

  try {
    const existing = await findUserByEmail(database.db, email);
    if (existing) {
      await assignRoles(database.db, existing.id, ["user", "admin"], null);
      console.log(`Existing user ${email} now has the admin role.`);
      return;
    }

    // The timezone is detected from the browser on the first sign-in.
    await createUser(database.db, {
      email,
      displayName: values.name?.trim() || defaultDisplayName(email),
      roleNames: ["user", "admin"],
    });
    console.log(
      `Administrator ${email} created. Sign in at ${config.PUBLIC_URL} with the emailed code.`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
