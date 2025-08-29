# 🐳 Docker Setup Guide

This guide explains how to configure Docker credentials for the CI/CD pipeline.

## 🔧 Docker Credentials Configuration

The GitHub Actions workflow requires Docker credentials to push images to Docker Hub. If credentials are not configured, the build will still succeed but won't push to the registry.

### Required Secrets

To enable Docker image pushing, add these secrets to your GitHub repository:

1. **DOCKER_USERNAME**: Your Docker Hub username
2. **DOCKER_PASSWORD**: Your Docker Hub password or access token

### How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret:
   - **Name**: `DOCKER_USERNAME`
   - **Value**: Your Docker Hub username
   - **Name**: `DOCKER_PASSWORD`
   - **Value**: Your Docker Hub password or access token

### Using Docker Access Token (Recommended)

For better security, use a Docker Hub access token instead of your password:

1. Go to [Docker Hub](https://hub.docker.com/settings/security)
2. Click **New Access Token**
3. Give it a name (e.g., "GitHub Actions")
4. Copy the token and use it as `DOCKER_PASSWORD`

## 🚀 Workflow Behavior

### With Credentials Configured

- ✅ Docker login successful
- ✅ Image pushed to Docker Hub
- ✅ Full CI/CD pipeline

### Without Credentials

- ⚠️ Docker login skipped
- ✅ Image built successfully
- ℹ️ Helpful notification message
- ❌ Image not pushed to registry

## 📋 Current Status

**Repository**: `stinocon/ialarm-mqtt`
**Registry**: `docker.io`
**Image Name**: `stinocon/ialarm-mqtt`

### Available Tags

- `latest` - Latest commit on master branch
- `vX.Y.Z` - Semantic version tags
- `master-<sha>` - Branch-specific tags

## 🔍 Troubleshooting

### Common Issues

1. **"Context access might be invalid: DOCKER_USERNAME"**
   - **Cause**: Docker credentials not configured
   - **Solution**: Add secrets as described above

2. **"Authentication failed"**
   - **Cause**: Invalid credentials
   - **Solution**: Check username/password or regenerate access token

3. **"Permission denied"**
   - **Cause**: Insufficient permissions on Docker Hub
   - **Solution**: Ensure account has push permissions for the repository

### Verification Steps

1. Check secrets are configured:

   ```bash
   # In GitHub repository settings
   Settings → Secrets and variables → Actions
   ```

2. Verify Docker Hub permissions:
   - Ensure you can push to `stinocon/ialarm-mqtt`
   - Check account permissions on Docker Hub

3. Test locally:
   ```bash
   docker login
   docker pull stinocon/ialarm-mqtt:latest
   ```

## 📚 Related Documentation

- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Docker Hub Access Tokens](https://docs.docker.com/docker-hub/access-tokens/)
- [Docker Build Action](https://github.com/docker/build-push-action)

## 🆘 Support

If you encounter issues:

1. Check the GitHub Actions logs for detailed error messages
2. Verify your Docker Hub credentials
3. Ensure repository permissions are correct
4. Contact the repository maintainer if problems persist

---

**Last Updated**: 2025-08-29  
**Version**: 0.12.1
