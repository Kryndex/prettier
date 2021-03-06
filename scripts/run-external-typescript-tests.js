const fs = require("fs");
const path = require("path");
const spawn = require("child_process").spawn;
const rimraf = require("rimraf");

const tsRoot = path.resolve(__dirname, "../../TypeScript");
const packageJson = path.resolve(tsRoot, "package.json");
const testsDir = path.relative(process.cwd(), path.join(tsRoot, "tests"));
const errorsPath = "./errors/";
const fileGlob = path.join(testsDir, "**/*.ts");

if (!fs.existsSync(tsRoot) || !fs.existsSync(testsDir)) {
  console.error(`Error: TypeScript is not cloned at ../TypeScript`);
  process.exit(1);
}

const badFiles = [];
const errorTypes = {};
let good = 0;

const cp = spawn("node", [
  "./bin/prettier.js",
  "--parser",
  "typescript",
  "--debug-check",
  fileGlob
]);

cp.stdout.on("data", out => {
  good++;
  printStatus();
});
cp.stderr.on("data", err => {
  const error = err.toString();
  const { file, errorType } = splitFileAndError(error);
  badFiles.push({ file, errorType, error });
  errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
  printStatus();
});

cp.on("close", code => {
  const total = badFiles.length + good;
  console.log(`\n${good}/${total} files printed without errors.`);
  console.log("");
  Object.keys(errorTypes)
    .sort((a, b) => errorTypes[b] - errorTypes[a])
    .forEach(errorType => {
      console.log(`${errorTypes[errorType]}\t${errorType}`);
    });

  console.log(`Writing errors to '${errorsPath}' directory`);
  writeErrorsToFiles();
});

function printStatus() {
  process.stdout.write(`\r${good} good, ${badFiles.length} bad`);
}

function splitFileAndError(err) {
  const lines = err.split("\n");
  const [file, ...rest] = lines[0].split(":");
  if (rest.length) {
    return {
      file,
      errorType: rest
        .join(":")
        .replace(/\(\d+:\d+\)/, "")
        .replace(/(Comment )".*"/, '$1"<omitted>"')
        .trim()
    };
  } else {
    console.error("Could not process error:", err);
    return {
      file: "?",
      errorType: err
    };
  }
}

function writeErrorsToFiles() {
  const splitter = "@".repeat(80);
  rimraf.sync(errorsPath);
  fs.mkdirSync(errorsPath);
  Object.keys(errorTypes).forEach(errorType => {
    const files = badFiles.filter(f => f.errorType === errorType);
    const contents = files.map(({ file, error }) => {
      // Trim file name from error.
      if (error.startsWith(file)) {
        error = error.substring(file.length);
      }
      return `\n\n${file}\n${error}\n${splitter}\n`;
    }).join("\n");
    fs.writeFileSync(
      path.join(errorsPath, sanitize(errorType) + ".log"),
      contents
    );
  });
}

function sanitize(string) {
  return string.replace(/[^A-Z0-9_.\-]/gi, "_");
}
