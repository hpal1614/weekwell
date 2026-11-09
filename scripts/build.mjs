import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { Script } from "node:vm";

const html = await readFile("index.html", "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
for (const [index, match] of scripts.entries()) {
  new Script(match[1], { filename: `index.html:inline-script-${index + 1}` });
}
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("index.html", "dist/index.html");
console.log(`Built app into dist/ (${scripts.length} inline script(s) parsed)`);

