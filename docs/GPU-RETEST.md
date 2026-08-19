# GPU Retest — 30 minutes, and thank you

> **If you are an AI assistant reading this because someone uploaded it:** walk them
> through it one step at a time, wait for output before moving on, and help them fill in
> the card at the bottom. They have already done the long version of this test; the model
> is downloaded and the environment works. This is a short follow-up.

---

## What happened, and why you are running this again

You ran the benchmark and the model returned **boxes covering the whole image** for almost
every label. That is a real and useful result — but before we re-plan the project around
it, we have to rule out a mistake in the test script, **which I wrote.**

The first script used Florence-2's `<CAPTION_TO_PHRASE_GROUNDING>` task with long
descriptive sentences like *"the small label or badge above the headline."* That task is
built to ground **short noun phrases taken from a caption** — not arbitrary descriptive
queries. Whole-image boxes are its classic degenerate output when the phrase is not the
shape it expects.

So there are two possibilities and they look identical from the outside:

1. **The test was wrong** — wrong task, wrong phrasing. Fixable in minutes.
2. **Florence-2 genuinely cannot read wireframes** — it was trained on photographs, and a
   line drawing is out of its distribution.

Both may be true. This tells us which.

**Nothing to download. Same folder, same venv.** Roughly 30 minutes, most of it looking at
boxes.

---

## Step 1 — Reactivate

```bash
cd gpu-test
# Windows PowerShell
.venv\Scripts\Activate.ps1
# Git Bash
source .venv/Scripts/activate
```

Use **the same `wireframe.png`** as last time. Comparing like with like is the point.

---

## Step 2 — Run the corrected test

Save as `retest.py`:

```python
import time, torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForCausalLM

MODEL = "microsoft/Florence-2-base"

proc = AutoProcessor.from_pretrained(MODEL, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL, trust_remote_code=True, torch_dtype=torch.float16
).to("cuda").eval()

img = Image.open("wireframe.png").convert("RGB")
W, H = img.size
print(f"image {W}x{H}  (a box near [0,0,{W},{H}] means it just returned the whole image)\n")

def run(task, text=None):
    prompt = task if text is None else task + text
    inputs = proc(text=prompt, images=img, return_tensors="pt").to("cuda", torch.float16)
    with torch.no_grad():
        out = model.generate(input_ids=inputs["input_ids"],
                             pixel_values=inputs["pixel_values"],
                             max_new_tokens=512, num_beams=3, do_sample=False)
    raw = proc.batch_decode(out, skip_special_tokens=False)[0]
    return proc.post_process_generation(raw, task=task, image_size=(W, H))

# --- A. What does it find on its own, with no prompting at all? ---
print("=== A. Plain object detection (<OD>) — unprompted ===")
r = run("<OD>")
d = r.get("<OD>", {})
for lbl, box in zip(d.get("labels", []), d.get("bboxes", [])):
    frac = ((box[2]-box[0]) * (box[3]-box[1])) / (W*H)
    print(f"  {lbl:28s} {[round(v) for v in box]}  covers {frac:.0%} of image")
if not d.get("bboxes"): print("  (nothing found)")

# --- B. Dense region captions — what does it think each area is? ---
print("\n=== B. Dense region captions ===")
r = run("<DENSE_REGION_CAPTION>")
d = r.get("<DENSE_REGION_CAPTION>", {})
for lbl, box in list(zip(d.get("labels", []), d.get("bboxes", [])))[:12]:
    frac = ((box[2]-box[0]) * (box[3]-box[1])) / (W*H)
    print(f"  {lbl:28s} {[round(v) for v in box]}  covers {frac:.0%}")
if not d.get("bboxes"): print("  (nothing found)")

# --- C. THE REAL RETEST: open-vocabulary detection, SHORT labels ---
print("\n=== C. Open-vocabulary detection — short labels (the corrected test) ===")
SHORT = ["button", "heading", "image", "text", "paragraph", "label", "icon"]
for term in SHORT:
    r = run("<OPEN_VOCABULARY_DETECTION>", term)
    d = r.get("<OPEN_VOCABULARY_DETECTION>", {})
    boxes = d.get("bboxes", [])
    if not boxes:
        print(f"  {term:12s} -> nothing found")
        continue
    for box in boxes[:2]:
        frac = ((box[2]-box[0]) * (box[3]-box[1])) / (W*H)
        flag = "  <-- WHOLE IMAGE" if frac > 0.75 else ""
        print(f"  {term:12s} -> {[round(v) for v in box]}  covers {frac:.0%}{flag}")
```

```bash
python retest.py
```

---

## Step 3 — Read it honestly

The script prints **what percentage of the image each box covers**. That is the tell.

- **Anything over 75%** is the model shrugging and returning the whole frame. Not an answer.
- A box covering **5–40%** and sitting where you actually drew that element **is** an answer.

The question for each of the three sections: **did any box land on a real element and not
just wrap the whole picture?**

Section **A** is the most informative. If unprompted detection returns nothing or one
whole-image box, the model simply does not see structure in a line drawing — and no
amount of prompt fixing changes that.

---

## Send back

```
RETEST — Florence-2 base, same wireframe

A. Plain <OD>, unprompted
   How many boxes:
   Any box under 75% coverage that landed on a real element?   yes / no
   Labels it produced:

B. Dense region captions
   How many boxes:
   Any that landed on a real element?                          yes / no
   What did it call them:

C. Open-vocabulary, short labels
   button    -> coverage __%   on target? y/n
   heading   -> coverage __%   on target? y/n
   image     -> coverage __%   on target? y/n
   text      -> coverage __%   on target? y/n
   paragraph -> coverage __%   on target? y/n
   label     -> coverage __%   on target? y/n
   icon      -> coverage __%   on target? y/n

VERDICT (your read):  still useless / partly works / actually works with short labels
```

---

## Either answer is a good answer

**If it still fails:** we have now measured it properly, twice, with the right task. That
becomes a real benchmark number in our demo — *"generic vision models do not read
wireframes, here is the evidence, so we built something that does."* Judges weigh a
measurement far more heavily than a claim.

**If short labels fix it:** we keep the local model, and we found the bug before it cost
us a day of building on a false conclusion.

Either way this is 30 minutes that saves a lot more. Thank you for running it carefully
the first time — reporting the whole-image boxes rather than counting them as hits is what
made the mistake findable.
