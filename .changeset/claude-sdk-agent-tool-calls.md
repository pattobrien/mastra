---
'@mastra/claude': patch
---

Fixed `ClaudeSDKAgent` so that `generate()` and `stream()` return the tool calls and tool results from the Claude Code session. `toolCalls`, `toolResults` and `steps[].toolCalls` are now populated from the session's `tool_use` and `tool_result` blocks, the response message carries a `tool-invocation` part per call ahead of the final text, and passing `returnScorerData: true` now returns `scoringData`. Scorers run through `runEvals` can now see which tools the agent called instead of receiving an undefined output.
