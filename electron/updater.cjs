const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

function versionParts(value) {
  return String(value || "0")
    .replace(/^v/i, "")
    .split(/[.-]/)
    .slice(0, 4)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = a[index] || 0;
    const bv = b[index] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function validHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

async function readManifest(manifestUrl) {
  if (!validHttpsUrl(manifestUrl)) {
    throw new Error("L'URL du manifest de mise à jour doit utiliser HTTPS.");
  }

  const response = await fetch(manifestUrl, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
  });
  if (!response.ok) {
    throw new Error(`Manifest de mise à jour inaccessible (HTTP ${response.status}).`);
  }

  const manifest = await response.json();
  const version = String(manifest?.version || "").trim();
  const downloadUrl = String(manifest?.url || "").trim();
  const sha256 = String(manifest?.sha256 || "").trim().toLowerCase();

  if (!version || !validHttpsUrl(downloadUrl) || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Manifest de mise à jour invalide : version, URL HTTPS et SHA-256 sont obligatoires.");
  }

  return {
    version,
    url: downloadUrl,
    sha256,
    notes: String(manifest?.notes || "").trim(),
  };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function downloadInstaller(manifest, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const filename = `MailDesk-Setup-${manifest.version}-x64.exe`;
  const finalPath = path.join(targetDir, filename);
  const partPath = `${finalPath}.part`;

  if (fs.existsSync(finalPath)) {
    const existingHash = await hashFile(finalPath);
    if (existingHash === manifest.sha256) {
      return finalPath;
    }
    fs.unlinkSync(finalPath);
  }

  const response = await fetch(manifest.url, {
    headers: { Accept: "application/octet-stream" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Téléchargement de la mise à jour impossible (HTTP ${response.status}).`);
  }

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partPath));
  const downloadedHash = await hashFile(partPath);
  if (downloadedHash !== manifest.sha256) {
    fs.unlinkSync(partPath);
    throw new Error("Le SHA-256 de la mise à jour téléchargée ne correspond pas au manifest.");
  }

  fs.renameSync(partPath, finalPath);
  return finalPath;
}

async function checkForUpdate({ currentVersion, manifestUrl, targetDir, download = true }) {
  const manifest = await readManifest(manifestUrl);
  const available = compareVersions(manifest.version, currentVersion) > 0;
  if (!available) {
    return {
      ok: true,
      available: false,
      currentVersion,
      latestVersion: manifest.version,
      message: "MailDesk est à jour.",
    };
  }

  const result = {
    ok: true,
    available: true,
    currentVersion,
    latestVersion: manifest.version,
    notes: manifest.notes,
    manifest,
    message: `MailDesk ${manifest.version} est disponible.`,
  };

  if (!download) return result;
  const installerPath = await downloadInstaller(manifest, targetDir);
  return { ...result, downloaded: true, installerPath };
}

module.exports = {
  checkForUpdate,
  compareVersions,
};
