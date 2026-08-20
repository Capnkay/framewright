# What to Read, and When

Nobody reads everything. This is the list of what each person actually needs, in order,
with honest timings.

**Total for a new teammate before they can build: about 20 minutes.**

---

## Tier 1 — everyone, before touching anything · ~20 min

| Read | Time | Why it is here |
|---|---|---|
| `AGENTS.md` | 4 min | **The canonical instruction file.** The ritual, the rules, where everything lives. Every other instruction file points here |
| `docs/html/HARNESS-BRIEF.html` | 6 min | What the harness is and what is in it. Read once, for orientation |
| `docs/html/TEAM-RULES.html` | 5 min | One page. Print it. The ritual, the eight rules, the trap that decides our score, and where files go |
| `SETUP.md` | 3 min | Get your machine working. Hooks path, your name, first run |
| `docs/BATON.md` | 7 min | How the build is handed between people. Read the failure cases — you will hit one |
| `docs/GIT-PROTOCOL.md` | 5 min | Branching, push cadence, what to do when your work goes stale |

`CLAUDE.md` is not on this list because you do not read it — it loads itself into every
session automatically. That is the point of it.

## Tier 2 — before your first task on a track · ~25 min

| Read | Who | Time |
|---|---|---|
| `docs/CONTRACT.md` §1–§9 | **everyone** | 15 min |
| `docs/CONTRACT.md` §10–§14 | API and perception tracks | 10 min |
| `docs/VERIFICATION.md` | perception and API tracks | 8 min |
| `docs/ROADMAP.md` phases and gates | everyone, skim | 5 min |

**§5.0, §7 and §9 of the contract are the three sections that decide our score.** If you
read nothing else in that document, read those. They are short.

You do not read the contract cover to cover before starting. Every Baton task names the
sections it needs, and you open those. The contract is a reference, not a novel.

## Tier 3 — reference, when you need it

| | |
|---|---|
| `docs/EDGE-CASES.md` | When something behaves strangely. Check here before debugging for twenty minutes |
| `docs/corrections/REGISTER.md` | What changed in a frozen document, and why |
| `docs/REVIEW-PROTOCOL.md` | What the code review checks, and what a finding means when one arrives |
| `docs/THREAT-MODEL.md` | Security posture. Required reading before the demo |
| `docs/html/stages/` | How each pipeline stage works. One page each, under 400 words |
| `README.md` | Licence table and forbidden dependencies. **Check before adding any model** |

## Not for circulation

`docs/DEMO-SITE-PLAN.md` is parked and unscheduled. Do not start it. Do not plan around it.

---

## What to send a new teammate

Three things, in one message:

1. The repo URL
2. `docs/html/TEAM-RULES.html` — or the Vercel link once it is live
3. *"Run setup, then type `continue build`. It will tell you what to work on."*

Everything else they need arrives at the moment they need it: the task names its contract
sections, `CLAUDE.md` loads the rules into every session, and `baton sync` tells them when
something they hold has gone stale.

**Do not paste the reasoning behind decisions into chat.** It goes stale the moment a
decision changes, and it competes with the versioned copy that does not. If something is
worth knowing twice, it belongs in a file.

---

## Before facing judges — everyone

| Read | Why |
|---|---|
| `docs/ROADMAP.md` — the demo section | The eight-minute script, beat by beat |
| Your own track's Stage Cards | You will be asked how your part works |
| `docs/VERIFICATION.md` — the metrics section | Have the number ready. "It works well" is not an answer |
| `docs/THREAT-MODEL.md` | Professional judges ask about security. Almost nobody has an answer |
| `docs/corrections/REGISTER.md` — source-material errors | Knowing where the brief contradicts itself is a strong signal that you read it properly |

**Every person should be able to say, in one sentence, what their subsystem takes in and
what it emits.** That sentence is the difference between a team that built something and a
team that assembled something.
