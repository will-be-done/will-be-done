This is my 5th attempt in 2 years to make task manager of my dream. And it looks like I very close to my dream!
I already use it daily, and I fairly enjoy it. Three reasons why I need it - self-hosted(I own my data),
daily planning and vim keybinds. Hope you find something that could be useful for you too!

You can try the cloud version for free at [will-be-done.app](https://will-be-done.app/) before installing through Docker.

<img width="1451" height="995" alt="screenshot" src="https://github.com/user-attachments/assets/ecbd5840-3509-4d76-a1be-66eaa481cc91" />


## Installation

Run with Docker:

```bash
docker run -d \
  -p 3000:3000 \
  -v will_be_done_storage:/app/apps/api/dbs \
  --restart unless-stopped \
  ghcr.io/will-be-done/will-be-done:latest
```

Then open http://localhost:3000 in your browser.

## Features

Top features:
1. Weekly timeline view - see multiple days as columns, plan your week visually
1. Local and offline first - works offline, syncs back when you're online
1. Top tier performance (it's based on own DB development - apps/hyperdb)
1. Everything drag & drop - move tasks between days, projects, categories
1. Kanban boards everywhere - each project has categories (Week/Month/Ideas/etc)
1. Multiple spaces - separate workspaces for work/personal/different projects
1. Keyboard navigation - vim-style keys (j/k) and arrows to move around fast
1. Self-hosted - one docker command, no external dependencies
1. Open source

Coming soon:
1. Attachments and comments for tasks
1. Global search
1. More vim keybindings (beyond basic j/k navigation)
1. Calendar integration
1. Mobile-friendly UI
1. Color and background customization per project

## Release Process

### Creating a Stable Release

1. Ensure main branch is stable and all tests pass
2. Create and push a version tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. GitHub Actions automatically builds and publishes to ghcr.io
4. Monitor workflow at: https://github.com/will-be-done/will-be-done/actions
5. Pull and deploy the release:
   ```bash
   docker pull ghcr.io/will-be-done/will-be-done:0.1.0
   # or
   docker pull ghcr.io/will-be-done/will-be-done:latest
   ```

### Canary Builds

- Every commit to main automatically builds a canary release
- Available as: `ghcr.io/will-be-done/will-be-done:canary`
- Also tagged with commit SHA: `ghcr.io/will-be-done/will-be-done:<sha>`
- Use for testing but not for production deployments

### Multi-platform Support

All images support:
- `linux/amd64`
- `linux/arm64`

Docker automatically pulls the correct architecture for your platform.

### Versioning

We follow Semantic Versioning:
- **MAJOR** version for incompatible API changes
- **MINOR** version for new features (backward compatible)
- **PATCH** version for bug fixes
