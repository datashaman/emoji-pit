import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point DB to a temp directory so tests don't use the real database
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "emoji-pit-test-"));
