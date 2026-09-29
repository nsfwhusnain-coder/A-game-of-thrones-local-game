// builds a scratch copy of a repo test with absolute imports, and optionally a stand-in for the missing module
import fs from 'node:fs';
const [, , src, dst, ...pairs] = process.argv;
let t = fs.readFileSync(src, 'utf8');
for (let i = 0; i < pairs.length; i += 2) t = t.split(pairs[i]).join(pairs[i + 1]);
t = t.replace(/(['"])\.\.\//g, '$1/home/user/wc-s1/');
t = t.replace("new URL(`./fixtures/headlines/${name}.json`, import.meta.url)", "'/home/user/wc-s1/tests/fixtures/headlines/' + name + '.json'");
fs.writeFileSync(dst, t);
