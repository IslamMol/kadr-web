// Универсальный шаг после esbuild:
// - локально, если есть Python, пересобирает HTML через build.py;
// - в Cloudflare (Python отсутствует) просто копирует уже собранные HTML в site/.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const candidates = [process.env.KADR_PYTHON, "python", "python3", "py"].filter(Boolean);

for (const cmd of candidates) {
  const args = cmd === "py" ? ["-3", "build.py"] : ["build.py"];
  const result = spawnSync(cmd, args, {
    cwd: root, stdio: "inherit",
    env: { ...process.env, KADR_SKIP_DESKTOP: "1" },
  });
  if (result.error) continue;
  if (result.status === 0) process.exit(0);
  // Python бывает заглушкой Store (9009) или缺失 (127) — пробуем следующий вариант.
  continue;
}

// Python недоступен — используем заранее собранные файлы из репозитория.
await import("./build-cloudflare.mjs");
