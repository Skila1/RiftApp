const fs = require("fs");
const { NtExecutable, NtExecutableResource, Data, Resource } = require("resedit");

function pickTranslation(versionInfo) {
  const translations = versionInfo.getAllLanguagesForStringValues();
  if (translations.length > 0) {
    return translations[0];
  }

  return { lang: 1033, codepage: 1200 };
}

function pickIconGroupId(entries) {
  const groups = Resource.IconGroupEntry.fromEntries(entries);
  if (groups.length > 0) {
    return groups[0].id;
  }

  return 101;
}

function ensureVersionInfo(entries) {
  const versionInfos = Resource.VersionInfo.fromEntries(entries);
  if (versionInfos.length > 0) {
    return versionInfos[0];
  }

  const versionInfo = Resource.VersionInfo.createEmpty();
  versionInfo.lang = 1033;
  versionInfo.fixedInfo.fileFlagsMask = 0x3f;
  versionInfo.fixedInfo.fileFlags = 0;
  versionInfo.fixedInfo.fileOS = 0x40004;
  versionInfo.fixedInfo.fileType = 1;
  versionInfo.fixedInfo.fileSubtype = 0;
  versionInfo.outputToResourceEntries(entries);

  return Resource.VersionInfo.fromEntries(entries)[0];
}

function patchWindowsMetadata({ exePath, icoPath, version, productName, companyName, copyright }) {
  const executable = NtExecutable.from(fs.readFileSync(exePath));
  const resource = NtExecutableResource.from(executable);
  const versionInfo = ensureVersionInfo(resource.entries);
  const translation = pickTranslation(versionInfo);
  const iconFile = Data.IconFile.from(fs.readFileSync(icoPath));

  Resource.IconGroupEntry.replaceIconsForResource(
    resource.entries,
    pickIconGroupId(resource.entries),
    translation.lang,
    iconFile.icons.map((item) => item.data)
  );

  versionInfo.setFileVersion(version, translation.lang);
  versionInfo.setProductVersion(version, translation.lang);
  versionInfo.setStringValues(translation, {
    CompanyName: companyName,
    FileDescription: productName,
    InternalName: productName,
    LegalCopyright: copyright,
    OriginalFilename: `${productName}.exe`,
    ProductName: productName,
  });
  versionInfo.outputToResourceEntries(resource.entries);

  resource.outputResource(executable);
  fs.writeFileSync(exePath, Buffer.from(executable.generate()));
}

module.exports = {
  patchWindowsMetadata,
};
