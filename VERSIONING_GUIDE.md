# 📋 Versioning Guide - iAlarm MQTT

## 🎯 Overview

This guide explains the versioning strategy and release process for the ialarm-mqtt project.

## 📊 Current Version

**Current Version**: `0.12.1`

**Version History**:

- `0.12.0` - Initial release (2024-12-19)
- `0.12.1` - Major modernization release (2025-08-29)

## 🔄 Versioning Strategy

### Semantic Versioning (SemVer)

This project follows [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH
   |     |     |
   |     |     └── Patch: Bug fixes, backwards compatible
   |     └──────── Minor: New features, backwards compatible
   └────────────── Major: Breaking changes, incompatible API
```

### Version Types

| Type      | Description                        | Example             | When to Use                                         |
| --------- | ---------------------------------- | ------------------- | --------------------------------------------------- |
| **PATCH** | Bug fixes, minor improvements      | `0.12.1` → `0.12.2` | Bug fixes, security patches, minor improvements     |
| **MINOR** | New features, backwards compatible | `0.12.1` → `0.13.0` | New features, enhancements, new APIs                |
| **MAJOR** | Breaking changes, incompatible     | `0.12.1` → `1.0.0`  | Breaking changes, major rewrites, incompatible APIs |

## 🚀 Automated Versioning

### Quick Commands

```bash
# Increment patch version (0.12.1 → 0.12.2)
npm run version:patch

# Increment minor version (0.12.1 → 0.13.0)
npm run version:minor

# Increment major version (0.12.1 → 1.0.0)
npm run version:major

# Set specific version
node scripts/version-bump.js 0.12.5
```

### Manual Version Bump

```bash
# Direct script usage
node scripts/version-bump.js patch
node scripts/version-bump.js minor
node scripts/version-bump.js major
node scripts/version-bump.js 0.12.5
```

## 📋 Release Process

### 1. Pre-Release Checklist

- [ ] All tests passing
- [ ] Code linting clean
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] Security audit clean

### 2. Version Bump

```bash
# Choose appropriate version bump
npm run version:patch    # For bug fixes
npm run version:minor    # For new features
npm run version:major    # For breaking changes
```

### 3. Review Changes

```bash
# Review what files were updated
git diff

# Check version in key files
grep '"version"' package.json
grep 'LABEL version' Dockerfile
```

### 4. Commit and Tag

```bash
# Commit version bump
git add .
git commit -m "chore: bump version to X.Y.Z"

# Create annotated tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

### 5. Push to Repository

```bash
# Push commits and tags
git push origin master
git push origin vX.Y.Z
```

### 6. Create GitHub Release

1. Go to GitHub repository
2. Click "Releases" → "Create a new release"
3. Select the tag `vX.Y.Z`
4. Add release title: `Release vX.Y.Z`
5. Copy changelog content from `CHANGELOG.md`
6. Publish release

### 7. Docker Build (Automated)

The GitHub Actions workflow will automatically:

- Build Docker image
- Run security scans
- Push to Docker Hub
- Create multi-arch images

## 📁 Files Updated by Version Bump

The version bump script automatically updates:

1. **`package.json`** - Main version field
2. **`Dockerfile`** - LABEL version field
3. **`CHANGELOG.md`** - Manual update required

## 🔧 Configuration

### Version Bump Script

Location: `scripts/version-bump.js`

Features:

- ✅ Automatic version parsing and incrementing
- ✅ Multiple file updates
- ✅ Validation of version format
- ✅ Clear instructions for next steps
- ✅ Support for specific version setting

### NPM Scripts

Added to `package.json`:

```json
{
  "scripts": {
    "version:patch": "node scripts/version-bump.js patch",
    "version:minor": "node scripts/version-bump.js minor",
    "version:major": "node scripts/version-bump.js major"
  }
}
```

## 📚 Changelog Management

### Changelog Structure

The `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [X.Y.Z] - YYYY-MM-DD

### Added

- New features

### Changed

- Changes in existing functionality

### Fixed

- Bug fixes
```

### Updating Changelog

1. **Before Release**: Add changes to `[Unreleased]` section
2. **During Release**: Move `[Unreleased]` content to new version section
3. **After Release**: Create new `[Unreleased]` section

## 🏷️ Tagging Strategy

### Tag Format

- **Format**: `vX.Y.Z` (e.g., `v0.12.1`)
- **Type**: Annotated tags with descriptive messages
- **Example**: `git tag -a v0.12.1 -m "Release v0.12.1 - Major Modernization"`

### Tag Management

```bash
# List all tags
git tag -l

# Show tag details
git show v0.12.1

# Delete local tag (if needed)
git tag -d v0.12.1

# Delete remote tag (if needed)
git push origin --delete v0.12.1
```

## 🔄 CI/CD Integration

### GitHub Actions Workflow

The `.github/workflows/main.yml` includes:

- ✅ **Security Scanning**: Trivy vulnerability scanning
- ✅ **Code Quality**: ESLint and Prettier checks
- ✅ **Testing**: Automated test execution
- ✅ **Docker Build**: Multi-arch image building
- ✅ **Release Automation**: Tag-based releases

### Automated Triggers

- **Push to master**: Security scan, code quality, testing
- **Release tag**: Docker build and publish
- **Pull Request**: Full CI pipeline

## 📈 Version History Examples

### Patch Release (0.12.1 → 0.12.2)

```bash
# Bug fix release
npm run version:patch
git add .
git commit -m "chore: bump version to 0.12.2"
git tag -a v0.12.2 -m "Release v0.12.2 - Bug Fixes"
git push origin master && git push origin v0.12.2
```

### Minor Release (0.12.1 → 0.13.0)

```bash
# Feature release
npm run version:minor
git add .
git commit -m "chore: bump version to 0.13.0"
git tag -a v0.13.0 -m "Release v0.13.0 - New Features"
git push origin master && git push origin v0.13.0
```

### Major Release (0.12.1 → 1.0.0)

```bash
# Breaking changes release
npm run version:major
git add .
git commit -m "chore: bump version to 1.0.0"
git tag -a v1.0.0 -m "Release v1.0.0 - Breaking Changes"
git push origin master && git push origin v1.0.0
```

## 🚨 Important Notes

### Version Consistency

- Always use the version bump script for consistency
- Never manually edit version numbers
- Ensure all version references are updated

### Release Timing

- **Patch releases**: As needed for bug fixes
- **Minor releases**: When new features are stable
- **Major releases**: For breaking changes or major milestones

### Breaking Changes

When making breaking changes:

1. Document changes clearly in changelog
2. Provide migration guide if needed
3. Consider deprecation warnings in previous versions
4. Test thoroughly before release

## 📞 Support

For versioning questions or issues:

1. Check this guide first
2. Review `CHANGELOG.md` for examples
3. Test version bump script locally
4. Create GitHub issue if needed

---

**Last Updated**: 2025-08-29  
**Current Version**: 0.12.1  
**Next Release**: 0.12.2 (patch) or 0.13.0 (minor) or 1.0.0 (major)
