#!/usr/bin/env node

/**
 * Version Bump Script for ialarm-mqtt
 * Automatically increments version numbers for releases
 *
 * Usage:
 *   node scripts/version-bump.js [patch|minor|major]
 *   node scripts/version-bump.js 0.12.2 (specific version)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Files that contain version information
// const VERSION_FILES = [
//   'package.json',
//   'Dockerfile'
// ]

function readJsonFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    process.exit(1);
  }
}

function writeJsonFile(filePath, data) {
  try {
    const content = JSON.stringify(data, null, 2) + '\n';
    writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated ${filePath}`);
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error.message);
    process.exit(1);
  }
}

function updateDockerfileVersion(filePath, newVersion) {
  try {
    let content = readFileSync(filePath, 'utf8');
    content = content.replace(
      /LABEL version="[^"]*"/,
      `LABEL version="${newVersion}"`
    );
    writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated ${filePath}`);
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error.message);
    process.exit(1);
  }
}

function parseVersion(version) {
  const parts = version.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

function incrementVersion(currentVersion, type) {
  const version = parseVersion(currentVersion);

  switch (type) {
    case 'major':
      version.major++;
      version.minor = 0;
      version.patch = 0;
      break;
    case 'minor':
      version.minor++;
      version.patch = 0;
      break;
    case 'patch':
      version.patch++;
      break;
    default:
      throw new Error(`Invalid version type: ${type}`);
  }

  return `${version.major}.${version.minor}.${version.patch}`;
}

function validateVersion(version) {
  const versionRegex = /^\d+\.\d+\.\d+$/;
  if (!versionRegex.test(version)) {
    throw new Error(
      `Invalid version format: ${version}. Expected format: x.y.z`
    );
  }
  return version;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
🚀 iAlarm-MQTT Version Bump Script

Usage:
  node scripts/version-bump.js [patch|minor|major]
  node scripts/version-bump.js 0.12.2 (specific version)

Examples:
  node scripts/version-bump.js patch    # 0.12.1 → 0.12.2
  node scripts/version-bump.js minor    # 0.12.1 → 0.13.0
  node scripts/version-bump.js major    # 0.12.1 → 1.0.0
  node scripts/version-bump.js 0.12.5   # Set specific version
`);
    process.exit(0);
  }

  const versionArg = args[0];

  // Read current version from package.json
  const packagePath = join(rootDir, 'package.json');
  const packageJson = readJsonFile(packagePath);
  const currentVersion = packageJson.version;

  console.log(`📦 Current version: ${currentVersion}`);

  let newVersion;

  // Check if it's a specific version or increment type
  if (versionArg.includes('.')) {
    // Specific version provided
    newVersion = validateVersion(versionArg);
  } else {
    // Increment type provided
    newVersion = incrementVersion(currentVersion, versionArg);
  }

  console.log(`🚀 New version: ${newVersion}`);

  // Update package.json
  packageJson.version = newVersion;
  writeJsonFile(packagePath, packageJson);

  // Update Dockerfile
  const dockerfilePath = join(rootDir, 'Dockerfile');
  updateDockerfileVersion(dockerfilePath, newVersion);

  console.log(`
🎉 Version bump completed successfully!

Next steps:
1. Review the changes: git diff
2. Commit the version bump: git add . && git commit -m "chore: bump version to ${newVersion}"
3. Create a tag: git tag -a v${newVersion} -m "Release v${newVersion}"
4. Push changes: git push origin master && git push origin v${newVersion}
5. Create GitHub release for v${newVersion}
`);
}

// Run the script
main();
