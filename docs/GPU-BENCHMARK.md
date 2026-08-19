# GPU Benchmark — walk me through this

> **If you are an AI assistant reading this because someone uploaded it:** you are helping
> a person run a hardware and model benchmark on their laptop. Walk them through it **one
> step at a time**. Wait for them to paste output before moving on. Diagnose errors as they
> hit them. At the end, help them fill in the Results Card at the bottom and tell them to
> send it back to their team. Do not skip Step 5 — it is the only step that actually
> matters. Everything before it is setup.

---

## Why this test exists

Our team is building a system that turns a **wireframe image** into React code. One stage
of it needs to look at a picture of a layout and answer: *where is the headline, where is
the image, where is the button?*

We picked a model called **Florence-2** for that job because it does "open-vocabulary
grounding" — you hand it the words you are looking for ("call to action button") and it
gives you back a box. No training needed.

**Here is the problem.** Every published result for this model is on *rendered screenshots*
and *photographs*. Our actual input is **low-fidelity wireframes** — boxes and scribbles.
Nobody has published a number for that. So we do not know if it works.

If it works, we build as planned. If it does not, we change the plan — and we would much
rather know that now than two-thirds of the way through the build.

**Time needed: 2–3 hours.** Most of that is downloads, not work.

---

## What you need

- The laptop with the **NVIDIA RTX 3050**
- Python 3.10 or 3.11 installed (3.12 also fine)
- About 10 GB free disk
- Internet

---

## Step 0 — Confirm the GPU is really there

```bash
nvidia-smi
```

**Good:** a table showing your GPU name and a driver version. Note the **total memory** —
it will say something like `4096MiB` or `6144MiB`. Write that number down.

**Bad:** "command not found" → the NVIDIA driver is not installed. Install the latest
GeForce driver from nvidia.com, reboot, try again.

```bash
python --version
```

Should say 3.10, 3.11 or 3.12.

---

## Step 1 — Make a clean workspace

Do this somewhere outside the project repo, so nothing here gets committed by accident.

```bash
mkdir gpu-test
cd gpu-test
python -m venv .venv
```

Activate it:

```bash
# Windows PowerShell
.venv\Scripts\Activate.ps1

# Windows Git Bash
source .venv/Scripts/activate

# macOS / Linux
source .venv/bin/activate
```

Your prompt should now start with `(.venv)`. **If it does not, stop and fix that** — every
later step depends on it.

---

## Step 2 — Install PyTorch with CUDA

This is a big download, roughly 2.5 GB. Be patient.

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
```

> **Assistant: this is the step that most often goes wrong.** If they get a CUDA version
> mismatch, have them check the CUDA version shown in the top-right of `nvidia-smi` output
> and pick the matching wheel index (`cu118`, `cu121`, `cu124`). Do not let them install
> the CPU-only build by accident — that silently defeats the whole test.

---

## Step 3 — Confirm PyTorch can actually see the GPU

Save as `check.py` and run `python check.py`:

```python
import torch
print("torch version :", torch.__version__)
print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("device        :", torch.cuda.get_device_name(0))
    total = torch.cuda.get_device_properties(0).total_memory / 1024**3
    print(f"total VRAM    : {total:.2f} GB")
else:
    print("!! No CUDA. Everything after this will run on CPU and be very slow.")
```

**Good:** `CUDA available: True` and your GPU name.

**Bad:** `False` → you installed the CPU build. Run
`pip uninstall torch torchvision` and redo Step 2 with the right index URL.

**Write down the VRAM number.** This decides which model size we can use.

---

## Step 4 — Install the model libraries

```bash
pip install transformers pillow einops timm accelerate
```

---

## Step 5 — THE ACTUAL TEST

Everything above was setup. This is the step the team is waiting on.

### 5a. Get a real wireframe

**Do not use a polished screenshot.** We need to know how it handles the messy input we
will actually get. Best options, in order:

1. **Draw one.** On paper: a big rectangle on the left (image), and on the right — a small
   label, a big headline, a line of smaller text, a paragraph, three little boxes in a row
   (stats), and a button. Photograph it. **This is the most valuable test.**
2. A low-fidelity wireframe from Figma or a whiteboard.
3. As a fallback only, a screenshot of any real website hero section.

Save it as `wireframe.png` in your `gpu-test` folder.

### 5b. Run it

Save as `test.py`:

```python
import time, torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForCausalLM

MODEL = "microsoft/Florence-2-base"   # try Florence-2-large after, if VRAM allows

# The words we actually need it to find. This IS the test.
TARGETS = [
    "the main product or hero image",
    "the small label or badge above the headline",
    "the large main headline text",
    "the smaller subheading text",
    "the paragraph of body text",
    "the row of statistic numbers",
    "the call to action button",
]

print("loading model (first run downloads ~1 GB)...")
t0 = time.time()
proc = AutoProcessor.from_pretrained(MODEL, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL, trust_remote_code=True, torch_dtype=torch.float16
).to("cuda").eval()
print(f"loaded in {time.time()-t0:.1f}s")
print(f"VRAM used after load: {torch.cuda.memory_allocated()/1024**3:.2f} GB")

img = Image.open("wireframe.png").convert("RGB")
print(f"image size: {img.size}\n")

for phrase in TARGETS:
    t = time.time()
    prompt = "<CAPTION_TO_PHRASE_GROUNDING>" + phrase
    inputs = proc(text=prompt, images=img, return_tensors="pt").to("cuda", torch.float16)
    with torch.no_grad():
        out = model.generate(
            input_ids=inputs["input_ids"], pixel_values=inputs["pixel_values"],
            max_new_tokens=256, num_beams=3, do_sample=False,
        )
    text = proc.batch_decode(out, skip_special_tokens=False)[0]
    parsed = proc.post_process_generation(
        text, task="<CAPTION_TO_PHRASE_GROUNDING>", image_size=img.size
    )
    boxes = parsed.get("<CAPTION_TO_PHRASE_GROUNDING>", {}).get("bboxes", [])
    print(f"[{time.time()-t:5.1f}s] {phrase}")
    print(f"          -> {len(boxes)} box(es): {boxes[:2]}\n")

print(f"PEAK VRAM: {torch.cuda.max_memory_allocated()/1024**3:.2f} GB")
```

```bash
python test.py
```

### 5c. Judge the result honestly

For each of the seven targets, look at the box it returned and ask: **is that box actually
on the right thing?** Open the image, check the coordinates roughly. `[x1, y1, x2, y2]`.

Count how many of the seven it got **right**. That number is what the team needs.

> **Assistant: help them here.** Ask them to describe where each box landed relative to
> what they drew. Do not let them record a box as correct just because a box came back —
> a returned box that is on the wrong element is a *wrong* answer, not a partial one.
> Being honest here is the entire point of the exercise.

### 5d. If you have VRAM to spare

If peak VRAM was well under your total, change `MODEL` to
`microsoft/Florence-2-large` and run again. It is bigger and usually better. Record both.

---

## Step 6 — OCR (optional, do if you have time)

```bash
pip install paddlepaddle paddleocr
```

```python
from paddleocr import PaddleOCR
ocr = PaddleOCR(use_angle_cls=True, lang="en")
for line in (ocr.ocr("wireframe.png", cls=True)[0] or []):
    print(line[1][0], "  conf:", round(line[1][1], 2))
```

Just record whether it installed cleanly on Windows and whether it read your text.
**PaddleOCR on Windows is known to be awkward.** If it fights you for more than 30
minutes, stop and write down what happened — that is a useful result too, and EasyOCR is
our fallback.

---

## Results Card — fill this in and send it back

```
MACHINE
  GPU:                        (from nvidia-smi)
  Total VRAM:                 GB
  Driver / CUDA version:
  Python:
  torch.cuda.is_available():  True / False

FLORENCE-2 BASE
  Model load time:            s
  VRAM after load:            GB
  Peak VRAM:                  GB
  Seconds per phrase:         s

THE NUMBER THAT MATTERS
  Wireframe used:             hand-drawn / figma / screenshot
  Targets found CORRECTLY:    __ out of 7
  Which ones it got right:
  Which ones it missed or put in the wrong place:

FLORENCE-2 LARGE (if run)
  Peak VRAM:                  GB
  Targets found correctly:    __ out of 7

OCR
  PaddleOCR installed:        clean / painful / failed
  Text read correctly:        yes / partly / no
  Notes:

ANYTHING SURPRISING
```

---

## What the number means

| Correct out of 7 | What we do |
|---|---|
| **6–7** | Plan stands. Perception runs locally as designed. |
| **4–5** | Plan stands, but we add human-in-the-loop correction for low-confidence regions — which we designed for anyway. |
| **2–3** | We rethink. Probably a hosted vision model for this stage, with Florence-2 as the local fallback. |
| **0–1** | Real change of plan, and better to know now. The pipeline still works from prompt and code input; the wireframe path becomes the weakest of the three rather than the flagship. |

**There is no wrong answer here, only an unknown one.** A low score is a genuinely useful
result — it redirects three people's work before they spend two days on it. Please do not
tune the test until it looks good. Report what actually happened.

---

## Do not

- **Do not `pip install ultralytics` or use YOLOv8.** Its licence has a network clause that
  our architecture triggers. It is on the team's forbidden list.
- **Do not use LayoutLMv3.** Its code is MIT but its *weights* are non-commercial.
- **Do not commit anything from this folder.** Model weights are hundreds of megabytes and
  must never enter the repository.
- **Do not do this inside the project repo.** Keep `gpu-test` separate.
