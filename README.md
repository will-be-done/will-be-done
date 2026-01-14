This is my 5th attempt in 2 years to make task manager of my dream. And it looks like I very close to my dream!
I already use it daily, and I fairly enjoy it. Two reasons why I need it - self-hosted(I own my data),
daily planning. Hope you find something that could be useful for you too!

Top features:
1. Weekly timeline view - see multiple days as columns, plan your week visually
2. Everything drag & drop - move tasks between days, projects, categories
3. Kanban boards everywhere - each project has categories (Week/Month/Ideas/etc)
4. Horizons - organize tasks by time scope (Week/Month/Year/Someday) instead of random priority numbers
5. Repeating tasks - set up recurring tasks with flexible schedules (daily, weekly, custom patterns)
6. Multiple spaces - separate workspaces for work/personal/different projects
7. Keyboard navigation - vim-style keys (j/k) and arrows to move around fast
8. Local first - works offline, syncs back when you're online
9. Self-hosted - one docker command, no external dependencies
10. Open source
11. Custom DB with b-tree indexes - way faster than Redux or similar libs, everything runs in-memory on frontend

Coming soon:
1. Attachments and comments for tasks
2. Global search
3. More vim keybindings (beyond basic j/k navigation)
4. Calendar integration
5. Mobile-friendly UI

## Release Process

### Creating a Stable Release

1. Ensure main branch is stable and all tests pass
2. Create and push a version tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. GitHub Actions automatically builds and publishes to ghcr.io
4. Monitor workflow at: https://github.com/quolpr/will-be-done-app/actions
5. Pull and deploy the release:
   ```bash
   docker pull ghcr.io/quolpr/will-be-done-app:0.1.0
   # or
   docker pull ghcr.io/quolpr/will-be-done-app:latest
   ```

### Canary Builds

- Every commit to main automatically builds a canary release
- Available as: `ghcr.io/quolpr/will-be-done-app:canary`
- Also tagged with commit SHA: `ghcr.io/quolpr/will-be-done-app:<sha>`
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
