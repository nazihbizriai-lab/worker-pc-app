"""
pywinauto demo: open a video in VLC and drive it by reading UI elements.

This mirrors the exact moves your accounting automation will use:
  1. Launch a Windows app
  2. Connect to its window (no fixed pixel coordinates)
  3. Read the UI elements it exposes (the "selector tree")
  4. Drive a control (here: pause / resume playback)
"""

import sys
import time

from pywinauto import Application

VLC = r"C:\Program Files\VideoLAN\VLC\vlc.exe"
VIDEO = r"D:\BUSSINESS AI TRAINING\skool video.mp4"
SHOT = r"D:\worker pc app\scripts\vlc_playing.png"


def log(msg):
    print(msg, flush=True)


# STEP 1 -- launch VLC with the video file as an argument
log("STEP 1: Launching VLC with the video via pywinauto...")
app = Application(backend="uia")
app.start(f'"{VLC}" "{VIDEO}"')

# VLC uses single-instance mode, so connect by the running process name.
# This works whether VLC was already open or we just started it.
time.sleep(4)
app.connect(path="vlc.exe", timeout=20)

# STEP 2 -- connect to the main window (by handle, not coordinates)
log("STEP 2: Connecting to the VLC window...")
win = app.top_window()
win.wait("visible ready", timeout=20)
log(f"   Window title : {win.window_text()!r}")
log(f"   Window rect  : {win.rectangle()}")

# STEP 3 -- read the UI elements VLC exposes (this is the selector tree)
log("STEP 3: Reading the UI elements (buttons) VLC exposes...")
try:
    buttons = win.descendants(control_type="Button")
    labelled = [b.window_text() for b in buttons if b.window_text()]
    log(f"   VLC exposes {len(buttons)} buttons; a sample with labels:")
    for name in labelled[:15]:
        log(f"     - Button: {name!r}")
except Exception as e:
    log(f"   (could not enumerate buttons: {e})")

# STEP 4 -- drive a control: pause, wait, resume (spacebar toggles play/pause)
log("STEP 4: Pausing playback...")
win.set_focus()
win.type_keys("{SPACE}")
time.sleep(3)
log("STEP 4: Resuming playback...")
win.type_keys("{SPACE}")

# Proof: capture the VLC window to an image (best effort; needs Pillow)
try:
    win.capture_as_image().save(SHOT)
    log(f"   Saved a screenshot of the window to: {SHOT}")
except Exception as e:
    log(f"   (screenshot skipped: {e})")

log("DONE. VLC opened the video and was driven entirely by pywinauto.")
