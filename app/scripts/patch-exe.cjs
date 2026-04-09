/**
 * Patches Rift.exe with the correct icon, product name, and file description
 * so Task Manager / Windows Search show "Rift" instead of "Electron".
 * Runs after electron-builder because signAndEditExecutable is false.
 */
const path = require("path");
const { patchWindowsMetadata } = require("./patch-windows-metadata.cjs");
const pkg = require("../package.json");

const exePath = path.join(
  __dirname,
  "..",
  pkg.build.directories.output,
  "win-unpacked",
  `${pkg.build.productName}.exe`
);
const icoPath = path.join(__dirname, "..", "build", "icon.ico");
const version = pkg.version;

async function main() {
  console.log(`Patching ${exePath} …`);
  patchWindowsMetadata({
    exePath,
    icoPath,
    version,
    productName: pkg.build.productName,
    companyName: pkg.author || "RiftApp",
    copyright: pkg.build.copyright || "",
  });
  console.log("Done — exe metadata updated.");
}

main().catch((err) => {
  console.error("patch-exe failed:", err);
  process.exit(1);
});
