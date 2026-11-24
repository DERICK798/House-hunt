const readline = require("node:readline");
const bcrypt = require("bcryptjs");
const db = require("../config/DB");

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden && process.stdin.isTTY) {
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      let value = "";
      const onData = (chunk) => {
        const char = chunk.toString("utf8");
        if (char === "\u0003") process.exit(1);
        if (char === "\r" || char === "\n") {
          process.stdin.removeListener("data", onData);
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          rl.close();
          resolve(value);
        } else if (char === "\u007f") {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      };
      process.stdin.on("data", onData);
      return;
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const setupSecret = process.env.ADMIN_SETUP_SECRET;
  if (!setupSecret || setupSecret.length < 32) {
    throw new Error("Set ADMIN_SETUP_SECRET to a random value of at least 32 characters first.");
  }

  const suppliedSecret = await ask("One-time setup secret: ", { hidden: true });
  if (suppliedSecret !== setupSecret) throw new Error("Setup secret did not match.");

  const fullName = (await ask("Admin full name: ")).trim();
  const email = (await ask("Admin email: ")).trim().toLowerCase();
  const password = await ask("New admin password (hidden): ", { hidden: true });
  if (!fullName || fullName.length > 120) throw new Error("Name is required and must be at most 120 characters.");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 150) throw new Error("Enter a valid email address (at most 150 characters).");
  if (password.length < 12 || password === "admin123") throw new Error("Use a password of at least 12 characters.");

  const [existing] = await db.execute("SELECT id FROM admins WHERE email = ?", [email]);
  if (existing.length) throw new Error("An admin with that email already exists; no changes were made.");

  const hash = await bcrypt.hash(password, 12);
  const [result] = await db.execute(
    "INSERT INTO admins (full_name, email, password) VALUES (?, ?, ?)",
    [fullName, email, hash]
  );
  console.log(`Admin created (id ${result.insertId}, ${email}). Verify login before removing any old admin.`);
}

main()
  .catch((error) => {
    console.error(`Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
