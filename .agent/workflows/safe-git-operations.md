---
description: Safe git operations for LAMS-2.0 to prevent accidental file deletion
---

# LAMS-2.0 Safe Git Workflow

## ⚠️ CRITICAL RULES — NEVER BREAK THESE

1. **NEVER run `git reset --hard`** without first running the backup script
2. **NEVER run `git clean -f` or `git clean -fd`** — this deletes untracked files
3. **NEVER assume a file is "safe to delete" because it's not in git** — untracked files can still be used by the app
4. **ALWAYS backup first** before any destructive git operation

---

## Before ANY Major Git Operation

// turbo
Run the backup script first:
```powershell
.\backup-src.ps1
```

Then verify what will change:
```powershell
git status -s
git diff --stat HEAD
```

---

## Safe Revert / Reset Procedure

**Step 1: Create backup**
```powershell
.\backup-src.ps1
```

**Step 2: Check what files exist on disk (not just in git)**
```powershell
Get-ChildItem -Path src -Recurse | Where-Object { -not $_.PSIsContainer } | Select-Object -ExpandProperty FullName
```

**Step 3: Check git status to understand full picture**
```powershell
git status -s
git stash list
```

**Step 4: If reverting, stash ALL (including untracked) first**
```powershell
git stash push -u -m "safety stash before operation"
```

**Step 5: Do the git operation**

**Step 6: Restore any needed untracked files from stash**
```powershell
git stash show stash@{0} --name-only
git checkout stash@{0} -- path/to/file
```

---

## After Any Git Operation — Verify Build

Always verify the build compiles cleanly after any git operation:
```powershell
npm run build 2>&1 | Select-String "error|Error|FAIL|missing" | Select-Object -First 20
```

If build fails, look for missing imports:
```powershell
$allFiles = Get-ChildItem -Path src -Recurse | Where-Object { -not $_.PSIsContainer -and $_.Extension -in '.jsx','.js' }
foreach ($f in $allFiles) {
    Get-Content $f.FullName | Select-String "from\s+'(\.[^']+)'" | ForEach-Object {
        $imp = $_.Matches[0].Groups[1].Value
        $resolved = Join-Path (Split-Path $f.FullName -Parent) $imp
        $found = (Test-Path "$resolved") -or (Test-Path "$resolved.jsx") -or (Test-Path "$resolved.js") -or (Test-Path "$resolved.css")
        if (-not $found) { Write-Host "MISSING: $($f.Name) -> $imp" }
    }
}
```

---

## Commit Safety

The pre-commit hook (`.git/hooks/pre-commit`) **automatically blocks** any commit that deletes files.

To bypass (only when intentional deletion is confirmed by user):
```bash
git commit --no-verify -m "message"
```

---

## LAMS-2.0 Critical Files (Never Delete)

These files are essential for the app to build and run. If any of these go missing, recreate them immediately:

### Pages (src/pages/)
- Dashboard.jsx, Assignments.jsx, Scheduler.jsx, Students.jsx
- GroupManager.jsx, Substitutions.jsx, Analytics.jsx
- MasterData.jsx, AdminPanel.jsx, Profile.jsx
- Suggestions.jsx, Resources.jsx, Syllabus.jsx
- Login.jsx, PublicView.jsx

### Components (src/components/)
- Layout.jsx, ErrorBoundary.jsx, QuantumLoader.jsx
- OfflineAlert.jsx, VersionManager.jsx, ConfirmModal.jsx
- CelebrationCard.jsx, SubstitutionManager.jsx
- ToastContainer.jsx, MasterDataCards.jsx
- scheduler/AssignmentDetailsModal.jsx
- scheduler/BookingModal.jsx, ScheduleGrid.jsx
- scheduler/SchedulerControls.jsx, SwapModal.jsx, QuickAssignPanel.jsx

### Utils (src/utils/)
- sortUtils.js, timeUtils.js, conflictDetection.js
- pdfGenerator.js, excelGenerator.js
- notificationUtils.js, cropImage.js

### Contexts (src/contexts/)
- AuthContext.jsx, MasterDataContext.jsx
- NotificationContext.jsx, ScheduleContext.jsx, ToastContext.jsx

### Styles (src/styles/)
- design-system.css, Assignments.css

### Lib (src/lib/)
- firebase.js, firebaseConfig.js

### API (api/)
- send-notification.js, check-classes.js
- public-schedule.js, revoke-session.js, version.js

### Root Configs
- vite.config.js, vercel.json, firestore.rules, package.json
