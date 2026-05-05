# Issue tracker: GitHub

Issues and PRDs for ShayFinance live as GitHub issues at `ShayIsso/ShayFinance`. Use the `gh` CLI for all operations.

## Conventions

- **Create**: `gh issue create --title "..." --body "..."` (use heredoc for multi-line bodies).
- **Read**: `gh issue view <number> --comments`.
- **List**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

`gh` resolves the repo from `git remote -v` automatically inside a clone. If it can't (occasional gh quirk seen on this repo), pass `--repo ShayIsso/ShayFinance` explicitly.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
