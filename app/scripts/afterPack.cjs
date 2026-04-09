/**
 * electron-builder afterPack hook.
 * Patches the exe with the correct icon + version info so Windows shows
 * "Rift" in Task Manager, search, and Alt-Tab instead of "Electron".
 *
 * We do this here because signAndEditExecutable is false (winCodeSign
 * symlink errors on non-admin Windows), so electron-builder does not patch
 * the Windows executable metadata for us.
 */
const path = require("path");
const { patchWindowsMetadata } = require("./patch-windows-metadata.cjs");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const pkg = require("../package.json");
  const productName = pkg.build.productName || "Rift";
  const exePath = path.join(context.appOutDir, `${productName}.exe`);
  const icoPath = path.join(__dirname, "..", "build", "icon.ico");

  console.log(`  • afterPack: patching ${productName}.exe metadata`);

  patchWindowsMetadata({
    exePath,
    icoPath,
    version: pkg.version,
    productName,
    companyName: pkg.author || "RiftApp",
    copyright: pkg.build.copyright || "",
  });

  console.log(`  • afterPack: done`);
};
