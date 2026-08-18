# Render with: vhs demo3.tape
# Plugin usage INSIDE a real Claude Code session in /tmp/test — user invokes
# the /memory-kb-* slash commands, Claude runs the installed scripts.
#
# Prerequisites (demo setup, already done for /tmp/test):
#   install/install-speckit-style.sh --no-mcp /tmp/test
#   cd /tmp/test && .agents/memory-kb/scripts/remember-fact.sh '(task improve-readme write-plugin-usage)'
#   ln -s ../../.agents/skills/* /tmp/test/.claude/skills/   (Claude Code skill discovery)
#
# Requires: brew install vhs ttyd (ffmpeg already present)
Output demo3.gif
Set Theme "Dracula"
Set FontSize 16
Set Width 1200
Set Height 600
Set TypingSpeed 40ms

# --- Open the project that has the plugin installed, start Claude Code ---
Type@40ms "cd /tmp/test"
Enter
Sleep 1s

Type@40ms "claude --dangerously-skip-permissions"
Enter
Sleep 12s

# --- User invokes the plugin slash command inside Claude ---
Type@40ms "/memory-kb-recall (task ?x ?y)"
Enter
Sleep 55s

# --- Provenance on demand ---
Type@40ms "/memory-kb-explain (task ?x ?y)"
Enter
Sleep 40s

Type@40ms "/quit"
Enter
Sleep 3s
