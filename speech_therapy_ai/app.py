from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import shutil
import subprocess
from datetime import datetime

from speech_analysis import analyze_speech

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _convert_to_wav_with_ffmpeg(source_path: str) -> str | None:
    """
    Best-effort conversion for browser formats (for example webm/opus) that
    may fail to decode directly on some systems.
    """
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None

    wav_path = f"{os.path.splitext(source_path)[0]}.wav"
    try:
        subprocess.run(
            [ffmpeg, "-y", "-i", source_path, "-ac", "1", "-ar", "16000", wav_path],
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[WARN] ffmpeg conversion failed: {exc}")
        return None

    return wav_path if os.path.exists(wav_path) else None


@app.route("/", methods=["GET"])
def index():
    """
    Serve the main SpeakEase UI.
    """
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health():
    """
    Simple health check endpoint.
    """
    return jsonify({"status": "ok"})


@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Receive an audio recording, run heuristic speech analysis,
    and return scores plus personalized practice suggestions.
    """
    if "audio" not in request.files:
        return jsonify({"error": "No audio file sent"}), 400

    audio = request.files["audio"]

    if audio.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    # Save uploaded audio with a timestamped name
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    ext = os.path.splitext(audio.filename)[1] or ".webm"
    filename = f"speech_{timestamp}{ext}"
    save_path = os.path.join(UPLOAD_DIR, filename)
    audio.save(save_path)

    try:
        result = None

        try:
            result = analyze_speech(save_path)
        except Exception as exc:
            converted = _convert_to_wav_with_ffmpeg(save_path)
            if converted:
                result = analyze_speech(converted)
            else:
                raise

        # Normalize the result into the rich structure expected by the frontend.
        # This makes the endpoint compatible with both the new `speech_analysis`
        # module and any older/simple analyzers that only return raw scores.
        if not isinstance(result, dict):
            raise TypeError("Analyzer did not return a dictionary.")

        if "status" not in result:
            # Legacy / simple output – wrap into the richer format.
            stut = int(result.get("stuttering", 0))
            lisp = int(result.get("lisp", 0))
            flu = int(result.get("fluency", 0))

            result = {
                "status": "success",
                "duration_seconds": result.get("duration_seconds"),
                "scores": {
                    "stuttering": stut,
                    "lisp": lisp,
                    "fluency": flu,
                },
                "summary": result.get("summary")
                or "We analyzed your speech and created quick scores you can use for practice.",
                "insights": result.get("insights")
                or [
                    "Use the stuttering and lisp scores as relative indicators rather than a diagnosis.",
                    "Try a 10–20 second recording at a calm pace for clearer feedback.",
                ],
                "exercises": result.get("exercises") or [],
                "level": result.get("level") or "balanced",
            }

    except Exception as exc:  # pragma: no cover - defensive
        # Log the error server-side and return a friendly message.
        print(f"[ERROR] Failed to analyze audio: {exc}")
        lower = str(exc).lower()
        if "format not recognised" in lower or "could not decode" in lower:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": (
                            "Unsupported audio format for analysis on this server. "
                            "Try Chrome or Edge, then record again for 10-20 seconds."
                        ),
                    }
                ),
                400,
            )
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "There was a problem analyzing your audio. Please try again.",
                }
            ),
            500,
        )

    return jsonify(result)


if __name__ == "__main__":
    print("🚀 SpeakEase started at http://127.0.0.1:5000")
    app.run(debug=True)
