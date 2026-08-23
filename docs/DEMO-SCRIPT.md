# Demo script — 5 to 8 minutes

PS7 §17 deliverable 6: a short demo script covering the wireframe, prompt and code inputs.

Hold this while presenting. Every command below was run against this repository before
being written down.

---

## Before you start — 5 minutes

```bash
cd D:\SIH\framewright
git pull --rebase
node tools/reset-demo-store.mjs      # clears test residue; backs the old store aside
```

That last one matters. Without it the preview page fills with sections generated on other
machines. It moves the old store aside rather than deleting it, so it is safe to run.

**Start three things, in this order:**

```bash
# 1. perception  (from perception/)
.venv/Scripts/python -m uvicorn perception.app:create_app --factory --host 127.0.0.1 --port 8000

# 2. the API     (from the repo root)
npm run server

# 3. the Studio  (from the repo root)
npm run dev --prefix client
```

**Check all three before you speak:**

```bash
curl http://localhost:8000/health          # {"ok":true,...}
curl http://localhost:5000/api/health      # {"ok":true,...}
curl -o NUL -w "%{http_code}\n" http://localhost:5173/generate   # 200
```

**Do not set `VLM_MODEL`.** Leave it unset and the whole demo runs locally in about 20
seconds a job, with no network. Set it and you add a 20-second network call to every run
for slightly cleaner text. On a venue's wifi that is a bad trade — and if it is unreachable
you now wait 20 seconds and fall back correctly, but you still wait.

---

## The run — four minutes

### 1. Open `/generate` and say what it does

> "You give it a hand-drawn wireframe, a description, or existing React. It gives you back
> a CMS-ready section — the component, the section record, the element records, and a live
> preview."

### 2. Upload the wireframe. **Wireframe** mode, then Generate.

`gpu-test/wireframe.png` — a photograph of a hand-drawn page.

**It takes about 15 seconds.** Fill it by talking about the seven stages appearing below.

### 3. The stage trace — this is the part worth dwelling on

All seven should read `ok`:

```
1 input-acquisition            5 code-generation-assembly
2 preprocessing-normalization  6 validation-qa
3 multimodal-understanding     7 output-delivery
4 semantic-planning-ir
```

> "Every stage records what it received, what it produced, and how confident it was. Nothing
> is a black box — you can open any stage and see its input and output."

**If stage 3 says `degraded`**, say so plainly: the perception service was not reached, the
job completed on the deterministic path, and the copy you are about to see is the template
rather than the drawing. It is a supported state, not a failure — §12 defines it. Do not
pretend it did not happen; the whole design is that degradation is visible.

### 4. The proof it actually read the drawing

Open the generated section and point at the copy:

> **`LABEL` · `HEADLINE` · `SUB HEADLINE` · `SUBMIT`**

**That is the wireframe's own handwriting.** If you see `PULSE FIT` or
`CHALLENGE YOUR LIMITS`, the wireframe did **not** reach the IR — that is the reference
template, and it means something upstream degraded. It is the single most useful tell on the
whole screen.

### 5. `/preview/Home` — it renders

The section mounts and renders. Scroll to **Content status** at the foot: it shows hydration
status, the number of fields loaded, and how many sections are not built on this machine.

### 6. The 25-point moment — change a value, watch it move

This is §9, and the judging script asks for it by name.

```bash
curl -X PATCH http://localhost:5000/api/elements/<fieldId> \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"CHANGED LIVE\"}"
```

Refresh the preview. **The text moves.**

> "Every text node renders as `data?.[id] || "DEFAULT"`, so a completely dead store looks
> pixel-identical to a working one. It compiles, it lints, it passes schema validation, it
> passes a screenshot check. The only thing that catches it is changing a value and seeing
> nothing move. That is why we run that assertion on every commit."

**Get the field id from the Content tab** in the Studio, or:
`curl "http://localhost:5000/api/elements?pageName=Home"`

### 7. The other three input modes — §17 requires all three be shown

Prompt and code are **instant** (under half a second), which is a nice contrast after the
wireframe's fifteen. Combined shows §6's conflict order: the wireframe supplies the layout,
the prompt supplies the copy.

**Note:** combined-with-a-wireframe currently only works through the API, not the Studio —
the UI's combined mode is code + prompt. If that has been fixed by demo time, use it; if
not, do not promise it.

---

## If something breaks

| what you see | what to say, and do |
|---|---|
| Stage 3 `degraded` | "Perception is not reachable; it completed on the deterministic path." True, supported, and the job still finished. |
| Copy says `PULSE FIT` | The wireframe did not reach the IR. Do not claim it read the drawing. Move to prompt mode, which is instant and always works. |
| Preview shows nothing | Check `Content status` at the foot. If it says 0 fields, the API is not reachable from the browser — restart the API. |
| A section says "not built on this machine" | Normal. It was generated elsewhere. Generate a fresh one. |
| Score is 85 not 100 | `axe` could not run on this machine. It is an environment issue, not the component. |
| Everything is on fire | Prompt mode. No network, no GPU, no perception service, under a second, and it demonstrates the CMS contract end to end. |

**The deterministic path always works.** No API key, no GPU, no network. That is a design
rule, not luck — and it is the honest fallback for any question you cannot answer live.

---

## The three numbers to have ready

- **7 of 7** slot geometry and **4 of 4** text — B-004
- **7 of 7** localisation at IoU ≥ 0.5 — B-003
- **0.8907** confidence, above §10's accept band of 0.85

Lead with accuracy, not confidence. If someone asks why confidence is not higher, the honest
answer is the interesting one: a synthetically clean wireframe scored **0.9634 while accuracy
fell to 4 of 7**, because confidence is the mean of what was *found*. Optimising it directly
selects for a detector that finds less and is surer about it. B-009 has the table.
