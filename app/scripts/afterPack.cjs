/**
 * electron-builder afterPack hook.
 * Patches the exe with the correct icon + version info so Windows shows
 * "Rift" in Task Manager, search, and Alt-Tab instead of "Electron".
 *
 * We do this here because signAndEditExecutable is false (winCodeSign
 * symlink errors on non-admin Windows), so electron-builder skips rcedit.
 */
const path = require("path");
const { rcedit } = require("rcedit");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const pkg = require("../package.json");
  const productName = pkg.build.productName || "Rift";
  const exePath = path.join(context.appOutDir, `${productName}.exe`);
  const icoPath = path.join(__dirname, "..", "build", "icon.ico");

  console.log(`  • afterPack: patching ${productName}.exe metadata`);

  await rcedit(exePath, {
    icon: icoPath,
    "version-string": {
      ProductName: productName,
      FileDescription: productName,
      CompanyName: pkg.author || "RiftApp",
      LegalCopyright: pkg.build.copyright || "",
      OriginalFilename: `${productName}.exe`,
      InternalName: productName,
    },
    "file-version": pkg.version,
    "product-version": pkg.version,
  });

  console.log(`  • afterPack: done`);
};
