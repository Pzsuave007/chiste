"""Local, free 9:16 video assembly with FFmpeg (imageio-ffmpeg binary).
Assembles cartoon scene images + ElevenLabs audio + burned-in subtitles into a vertical MP4,
with simple Ken Burns camera movements. No third-party render service required.
"""
import os
import re
import subprocess
import tempfile
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
W, H, FPS = 1080, 1920, 30
BASE_W, BASE_H = 1620, 2880  # oversized base gives zoompan headroom

_ENC_CACHE = {}


def _video_encoder():
    if "v" in _ENC_CACHE:
        return _ENC_CACHE["v"]
    out = subprocess.run([FFMPEG, "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    enc = "libx264" if "libx264" in out else ("libopenh264" if "libopenh264" in out else "mpeg4")
    _ENC_CACHE["v"] = enc
    return enc


def _duration(path):
    p = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", p.stderr)
    if not m:
        return None
    h, mn, s = m.groups()
    return int(h) * 3600 + int(mn) * 60 + float(s)


def _subtitle_png(text, path):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if not text or not text.strip():
        img.save(path)
        return
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, 62)
    words = text.strip().split()
    lines, cur = [], ""
    maxw = W - 200
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    line_h = 82
    total_h = line_h * len(lines)
    y0 = H - 360 - total_h
    pad = 34
    draw.rounded_rectangle(
        [70, y0 - pad, W - 70, y0 + total_h + pad], radius=32, fill=(11, 15, 23, 175)
    )
    y = y0
    for ln in lines:
        tw = draw.textlength(ln, font=font)
        x = (W - tw) / 2
        draw.text((x, y), ln, font=font, fill=(255, 255, 255, 255),
                  stroke_width=5, stroke_fill=(0, 0, 0, 255))
        y += line_h
    img.save(path)


def _zoompan(motion, frames):
    f = max(int(frames), 1)
    center = f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
    common = f":d={f}:s={W}x{H}:fps={FPS}"
    if motion == "zoom_in":
        return f"zoompan=z='1+0.18*on/{f}':{center}{common}"
    if motion == "zoom_out":
        return f"zoompan=z='1.18-0.18*on/{f}':{center}{common}"
    if motion == "pan_left":
        return f"zoompan=z='1.15':x='(iw-iw/zoom)*(1-on/{f})':y='ih/2-(ih/zoom/2)'{common}"
    if motion == "pan_right":
        return f"zoompan=z='1.15':x='(iw-iw/zoom)*(on/{f})':y='ih/2-(ih/zoom/2)'{common}"
    if motion == "tilt_up":
        return f"zoompan=z='1.15':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/{f})'{common}"
    return f"zoompan=z='1.06':{center}{common}"


def _render_segment(scene, workdir, idx):
    img_path = os.path.join(workdir, f"img_{idx}.png")
    with open(img_path, "wb") as fh:
        fh.write(scene["image_bytes"])

    audio_path = None
    if scene.get("audio_bytes"):
        audio_path = os.path.join(workdir, f"aud_{idx}.mp3")
        with open(audio_path, "wb") as fh:
            fh.write(scene["audio_bytes"])

    sfx_path = None
    if scene.get("sfx_bytes"):
        sfx_path = os.path.join(workdir, f"sfx_{idx}.mp3")
        with open(sfx_path, "wb") as fh:
            fh.write(scene["sfx_bytes"])

    dur = _duration(audio_path) if audio_path else None
    dur = max(1.8, (dur or 3.0) + 0.4)  # small tail after speech
    frames = round(dur * FPS)

    sub_path = os.path.join(workdir, f"sub_{idx}.png")
    _subtitle_png(scene.get("dialogue", ""), sub_path)

    seg_path = os.path.join(workdir, f"seg_{idx}.mp4")
    zp = _zoompan(scene.get("camera_motion", "zoom_in"), frames)
    fc = (
        f"[0:v]scale={BASE_W}:{BASE_H}:force_original_aspect_ratio=increase,"
        f"crop={BASE_W}:{BASE_H},setsar=1,{zp}[bg];"
        f"[bg][1:v]overlay=0:0,format=yuv420p[v]"
    )
    # inputs: 0=image, 1=subtitle, 2=voice/silent, [3=sfx]
    cmd = [FFMPEG, "-y", "-loop", "1", "-t", f"{dur}", "-i", img_path, "-i", sub_path]
    if audio_path:
        cmd += ["-i", audio_path]
    else:
        cmd += ["-f", "lavfi", "-t", f"{dur}", "-i", "anullsrc=r=44100:cl=stereo"]

    if sfx_path:
        cmd += ["-i", sfx_path]
        fc += (
            ";[3:a]volume=0.8,aformat=sample_rates=44100:channel_layouts=stereo[sfx];"
            "[2:a]aformat=sample_rates=44100:channel_layouts=stereo[vox];"
            "[vox][sfx]amix=inputs=2:duration=longest:normalize=0,apad[aout]"
        )
    else:
        fc += ";[2:a]aformat=sample_rates=44100:channel_layouts=stereo,apad[aout]"
    amap = "[aout]"

    cmd += [
        "-filter_complex", fc, "-map", "[v]", "-map", amap,
        "-c:v", _video_encoder(), "-pix_fmt", "yuv420p", "-r", f"{FPS}",
        "-t", f"{dur}", "-c:a", "aac", "-ar", "44100", "-b:a", "128k",
        seg_path,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not os.path.exists(seg_path):
        raise RuntimeError(f"segment {idx} failed: {res.stderr[-600:]}")
    return seg_path


def render_video(scenes):
    """scenes: list of dict {image_bytes, audio_bytes|None, dialogue, camera_motion}.
    Returns MP4 bytes of the assembled 9:16 video."""
    scenes = [s for s in scenes if s.get("image_bytes")]
    if not scenes:
        raise RuntimeError("No scenes with generated images to render")
    with tempfile.TemporaryDirectory() as workdir:
        segs = [_render_segment(s, workdir, i) for i, s in enumerate(scenes)]
        list_path = os.path.join(workdir, "list.txt")
        with open(list_path, "w") as fh:
            for seg in segs:
                fh.write(f"file '{seg}'\n")
        out_path = os.path.join(workdir, "final.mp4")
        res = subprocess.run(
            [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", list_path,
             "-c", "copy", "-movflags", "+faststart", out_path],
            capture_output=True, text=True,
        )
        if res.returncode != 0 or not os.path.exists(out_path):
            # fallback: re-encode concat
            res = subprocess.run(
                [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", list_path,
                 "-c:v", _video_encoder(), "-pix_fmt", "yuv420p", "-c:a", "aac",
                 "-movflags", "+faststart", out_path],
                capture_output=True, text=True,
            )
            if res.returncode != 0 or not os.path.exists(out_path):
                raise RuntimeError(f"concat failed: {res.stderr[-600:]}")
        with open(out_path, "rb") as fh:
            return fh.read()
