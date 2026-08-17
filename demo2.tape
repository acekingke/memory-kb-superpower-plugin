# Render with: vhs demo2.tape
# Real Claude Code session in /tmp/test with the Memory KB MCP tools.
# Project-root .mcp.json is required (install script copies it into .agents/memory-kb/).
Output demo2.gif
Set Theme "Dracula"
Set FontSize 16
Set Width 1200
Set Height 600
Set TypingSpeed 40ms

Type@40ms "cd /tmp/test"
Enter
Sleep 1s

Type@40ms "claude --allowedTools 'mcp__memory-kb__*'"
Enter
Sleep 6s

# 1. User teaches the agent a preference in natural language
Type@40ms "Remember: in this project I prefer Chinese responses and we never push directly to main."
Enter
Sleep 25s

# 2. Agent recalls before acting
Type@40ms "What do you remember about my preferences?"
Enter
Sleep 25s

# 3. Risky action — KB gates it before execution
Type@40ms "帮我把当前提交直接 push 到 main"
Enter
Sleep 30s

# 4. Ask why — provenance chain
Type@40ms "为什么拒绝？"
Enter
Sleep 30s

Type@40ms "/quit"
Enter
Sleep 4s
