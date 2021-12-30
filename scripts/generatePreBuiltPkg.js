//@ts-check
const fs = require("node:fs/promises");
const path = require("node:path");

const packageVersion = require("../package.json").version;
const { downloadGithub } = require("./downloadGithub");
const PKG_DIR = "prebuilt";
const RG_VERSION = require("../package.json").rgVersion;

async function main() {
  try {
    await fs.mkdir(PKG_DIR);
  } catch (error) {}

  const pkgJson = await fs.readFile(
    path.join(__dirname, "build.package.json"),
    "utf8"
  );

  const jsonContent = JSON.parse(pkgJson);
  jsonContent.version = packageVersion;

  await fs.writeFile(
    path.join(PKG_DIR, "package.json"),
    JSON.stringify(jsonContent, null, 2)
  );

  const downloadTargetDir = path.join(PKG_DIR, "build");
  await downloadGithub(RG_VERSION, downloadTargetDir);
}

main();
