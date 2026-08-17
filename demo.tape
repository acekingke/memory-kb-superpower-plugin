# Render with: vhs demo.tape
# Requires: brew install vhs ttyd (ffmpeg already present)
Output demo.gif
Set Theme "Dracula"
Set FontSize 16
Set Width 1200
Set Height 600
Set TypingSpeed 40ms

# --- Scenario 1: remember a preference, conflicting write is rejected ---

Type@40ms "./scripts/remember-fact.sh '(prefers user language zh-CN)'"
Enter
Sleep 2s

Type@40ms "./scripts/remember-fact.sh '(prefers user language en-US)'"
Enter
Sleep 3s

# --- Scenario 2: project dependencies — task becomes ready, with provenance ---

Type@40ms "./scripts/remember-fact.sh '(dep release-v1.2 design-review)'"
Enter
Sleep 2s

Type@40ms "./scripts/remember-fact.sh '(done design-review)'"
Enter
Sleep 2s

Type@40ms "./scripts/explain.sh '(ready ?task)'"
Enter
Sleep 3s

# --- Scenario 3: permission conflict — capability above level is rejected ---

Type@40ms "./scripts/remember-fact.sh '(domain-level billing-system project-lead 1)'"
Enter
Sleep 2s

Type@40ms "./scripts/remember-fact.sh '(domain-level billing-system approve-budget 3)'"
Enter
Sleep 2s

Type@40ms "./scripts/remember-fact.sh '(greater-than 3 1)'"
Enter
Sleep 2s

Type@40ms "./scripts/remember-fact.sh '(domain-capability billing-system project-lead approve-budget)'"
Enter
Sleep 3s

# --- Memory is source code — undo everything with git ---

Type@40ms "git checkout -- kb/kb.scm"
Enter
Sleep 2s
