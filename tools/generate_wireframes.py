import cv2
import numpy as np

def draw_wireframe(filename, elements):
    # Create white canvas 1000x800
    img = np.ones((1000, 800, 3), dtype=np.uint8) * 255
    
    for (type, x, y, w, h, text) in elements:
        # Draw box
        cv2.rectangle(img, (x, y), (x+w, y+h), (0, 0, 0), 2)
        if type == "image":
            cv2.line(img, (x, y), (x+w, y+h), (0, 0, 0), 2)
            cv2.line(img, (x+w, y), (x, y+h), (0, 0, 0), 2)
        elif text:
            font = cv2.FONT_HERSHEY_SIMPLEX
            text_size = cv2.getTextSize(text, font, 1, 2)[0]
            text_x = x + (w - text_size[0]) // 2
            text_y = y + (h + text_size[1]) // 2
            cv2.putText(img, text, (text_x, text_y), font, 1, (0, 0, 0), 2, cv2.LINE_AA)

    cv2.imwrite(filename, img)

draw_wireframe('demo_wf1.png', [
    ('text', 100, 100, 600, 100, "Pulse Fit"),
    ('text', 100, 250, 600, 50, "Track your fitness journey"),
    ('text', 100, 350, 200, 50, "Get Started"),
    ('image', 400, 350, 300, 300, ""),
])

draw_wireframe('demo_wf2.png', [
    ('text', 100, 100, 600, 80, "Our Features"),
    ('text', 100, 250, 250, 150, "Workout Tracking"),
    ('text', 450, 250, 250, 150, "Meal Planning"),
    ('text', 100, 450, 250, 150, "Live Classes"),
    ('text', 450, 450, 250, 150, "Community"),
])

print("Wireframes generated.")
