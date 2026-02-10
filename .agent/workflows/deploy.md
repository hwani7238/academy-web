---
description: Deploy current changes to GitHub automatically
---

// turbo-all

1. Add all changes
```bash
git add .
```

2. Commit changes (using a generic message if none provided, but usually better to be specific. For this workflow lets use a timestamp or generic)
```bash
git commit -m "chore: auto-deploy updates"
```

3. Push to main
```bash
git push origin main
```
