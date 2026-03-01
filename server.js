const express = require("express");
const multer = require("multer");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
app.use(require("cors")());

app.post("/compile", async (req, res) => {
  const { file_urls, file_names, project_name, optimization_level,
          extra_flags, exported_functions, use_sdl, use_opengl, use_glfw } = req.body;

  const workDir = `/tmp/build-${Date.now()}`;
  fs.mkdirSync(workDir, { recursive: true });

  // Download files from Base44 storage
  for (let i = 0; i < file_urls.length; i++) {
    const buf = await fetch(file_urls[i]).then(r => r.buffer());
    fs.writeFileSync(path.join(workDir, file_names[i]), buf);
  }

  const cppFiles = file_names.filter(f => f.endsWith(".cpp") || f.endsWith(".c")).join(" ");
  let flags = `-${optimization_level}`;
  if (use_sdl)    flags += " -s USE_SDL=2";
  if (use_opengl) flags += " -s USE_WEBGL2=1 -s FULL_ES3=1";
  if (use_glfw)   flags += " -s USE_GLFW=3";
  if (exported_functions) flags += ` -s EXPORTED_FUNCTIONS='[${exported_functions.split(",").map(f => `"${f.trim()}"`).join(",")}]'`;
  if (extra_flags) flags += ` ${extra_flags}`;
  flags += " -s ALLOW_MEMORY_GROWTH=1";

  const outName = project_name || "output";
  const cmd = `cd ${workDir} && emcc ${cppFiles} ${flags} -o ${outName}.html`;

  exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
    const log = stdout + "\n" + stderr;
    if (err) return res.json({ error: err.message, compile_log: log });

    // Read and return files as base64 or serve them — 
    // simplest: return file contents as base64
    const wasmPath = path.join(workDir, `${outName}.wasm`);
    const jsPath   = path.join(workDir, `${outName}.js`);
    const htmlPath = path.join(workDir, `${outName}.html`);

    // For production: upload to S3/R2 and return URLs
    // For demo: return as base64 data URIs
    const toDataUri = (p, mime) => fs.existsSync(p)
      ? `data:${mime};base64,${fs.readFileSync(p).toString("base64")}` : null;

    res.json({
      wasm_url: toDataUri(wasmPath, "application/wasm"),
      js_url:   toDataUri(jsPath,   "application/javascript"),
      html_url: toDataUri(htmlPath, "text/html"),
      compile_log: log,
    });

    fs.rmSync(workDir, { recursive: true, force: true });
  });
});

app.listen(process.env.PORT || 3001, () =>
  console.log("Emscripten server running on port 3001"));
