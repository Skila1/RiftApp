/**
 * Patches Rift.exe with the correct icon, product name, and file description
 * so Task Manager / Windows Search show "Rift" instead of "Electron".
 * Runs after electron-builder (which skips rcedit due to signAndEditExecutable: false).
 */
const path = require("path");
const rcedit = require("rcedit");
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
  await rcedit(exePath, {
    icon: icoPath,
    "version-string": {
      ProductName: pkg.build.productName,
      FileDescription: pkg.build.productName,
      CompanyName: pkg.author || "RiftApp",
      LegalCopyright: pkg.build.copyright,
      OriginalFilename: `${pkg.build.productName}.exe`,
      InternalName: pkg.build.productName,
    },
    "file-version": version,
    "product-version": version,
  });
  console.log("Done — exe metadata updated.");
}

main().catch((err) => {
  console.error("patch-exe failed:", err);
  process.exit(1);
});
