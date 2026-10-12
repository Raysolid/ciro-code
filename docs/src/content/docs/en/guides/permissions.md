---
title: Permissions & Security
description: Workspace sandboxing, policy presets, human approvals, and shell allowlists.
---

Security is a foundational tenet of Ciro Code. The agent does not run with unfettered root access; it operates strictly inside a **workspace sandbox** bounded by **human approval policies**.

---

## Policy Presets

In `{workspace}/.ciro/config.yaml` or through the workbench settings, configure preset security levels:

| Preset | Paired Mode | Security Behavior & Scope |
|--------|-------------|---------------------------|
| `workspace-readonly` | Default in Ask | Strictly read-only; denies file writes and mutating shell commands |
| `workspace-balanced` *(Recommended)* | Default in Agent | Edits workspace files and runs allowlisted commands; prompts on sensitive actions |
| `workspace-unrestricted` | Trusted setups | Streamlined approvals; still confined inside the workspace root boundary |

---

## Configuration Example

Declare permissions and command allowlists explicitly in `.ciro/config.yaml`:

```yaml
# {workspace}/.ciro/config.yaml
mode: agent

permissions:
  preset: workspace-balanced
  fs:
    # Allowed write paths relative to workspace root
    allow: ["src/**", "tests/**", "package.json"]
    # Denied sensitive targets
    deny: [".env*", "*.pem", "deploy/production/**"]
  shell:
    # Auto-approved commands (supports glob wildcards)
    allowlist:
      - "git status"
      - "git diff*"
      - "pnpm test*"
      - "npm run build"
      - "npx eslint *"
    # Strictly blocked commands
    deny:
      - "rm -rf *"
      - "curl *"
      - "wget *"
      - "drop database *"
```

---

## Interactive Human Approval

When the agent attempts to execute an unlisted command or touch an edge path, the execution loop pauses and displays an **approval modal** in the workbench:

- **Allow Once**: Authorizes the single execution step (useful for ad-hoc debugging).
- **Always Allow**: Appends the command pattern to the active workspace's allowlist.
- **Deny**: Rejects the execution. The agent receives a rejection message and seeks an alternative plan.

---

## Network Egress Boundaries

- **Model Inference**: Dispatched directly to the LLM endpoints you explicitly configure (e.g. DeepSeek, OpenAI). No third-party proxy relays your traffic.
- **Web Tools**: Active only when search extensions or specialized MCP tools are deliberately configured.
- **Shell Firewall**: The policy engine actively intercepts ad-hoc `curl`, `wget`, or PowerShell Web Cmdlets (`Invoke-WebRequest`) in generated shell scripts to prevent code leakage.

See [SECURITY.md](https://github.com/Raysolid/ciro-code/blob/main/SECURITY.md) for full vulnerability reporting guidelines.
