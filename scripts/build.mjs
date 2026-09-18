import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicPath = join(root,'public');
let html = await readFile(join(publicPath,'index.html'),'utf8');
const css = await readFile(join(publicPath,'style.css'),'utf8');
const core = await readFile(join(publicPath,'core.js'),'utf8');
const visuals = await readFile(join(publicPath,'word-visuals.js'),'utf8');
const app = await readFile(join(publicPath,'app.js'),'utf8');
const favicon = await readFile(join(publicPath,'favicon.svg'),'utf8');
html = html.replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">',`<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}" type="image/svg+xml">`)
  .replace('<link rel="stylesheet" href="style.css">',`<style>\n${css}\n</style>`)
  .replace('  <script src="core.js" defer></script>\n  <script src="word-visuals.js" defer></script>\n  <script src="app.js" defer></script>','')
  .replace('</body>',`<script>\nglobalThis.NAIMONO_STANDALONE = true;\n${core}\n${visuals}\n${app}\n</script>\n</body>`);
await mkdir(join(root,'dist'),{recursive:true});
await writeFile(join(root,'dist','naimono.html'),html);
console.log('Built dist/naimono.html — standalone demo, no API key or external assets.');
