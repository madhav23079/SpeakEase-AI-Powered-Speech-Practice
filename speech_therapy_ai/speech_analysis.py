import math
from typing import Dict, List, Tuple

import librosa
import numpy as np


def _safe_scale(value: float, min_value: float, max_value: float) -> int:
    """
    Scale an unbounded heuristic value into a 0–100 range.
    """
    if max_value <= min_value:
        return 0
    clamped = max(min_value, min(max_value, value))
    return int(100 * (clamped - min_value) / (max_value - min_value))


def _segment_speech(rms: np.ndarray, sr: int, hop_length: int) -> List[Tuple[float, float]]:
    """
    Very simple energy-based voice activity detection to split the signal
    into voiced segments.
    """
    if rms.size == 0:
        return []

    threshold = 0.1 * float(np.max(rms))
    if threshold <= 0:
        return []

    voiced = rms > threshold
    segments: List[Tuple[float, float]] = []
    current_start: float | None = None

    for i, is_voiced in enumerate(voiced):
        t = i * hop_length / float(sr)
        if is_voiced:
            if current_start is None:
                current_start = t
        else:
            if current_start is not None:
                segments.append((current_start, t))
                current_start = None

    if current_start is not None:
        # Close final segment
        end_time = len(voiced) * hop_length / float(sr)
        segments.append((current_start, end_time))

    return segments


def _build_summary(stuttering: int, lisp: int, fluency: int) -> str:
    """
    Create a human-friendly summary of the analysis.
    """
    parts: List[str] = []

    if stuttering >= 70:
        parts.append("Your speech shows strong signs of stuttering patterns.")
    elif stuttering >= 40:
        parts.append("Your speech shows some mild to moderate stuttering patterns.")
    else:
        parts.append("We detected only light or occasional stuttering features.")

    if lisp >= 70:
        parts.append("There are strong hints of a lisp-like articulation pattern.")
    elif lisp >= 40:
        parts.append("There are some indications of a mild lisp pattern.")
    else:
        parts.append("We did not detect strong evidence of a lisp pattern.")

    if fluency >= 70:
        parts.append("Overall fluency is generally good; keep practicing to make it even smoother.")
    elif fluency >= 40:
        parts.append("Overall fluency is moderate; focused practice can improve stability and flow.")
    else:
        parts.append("Overall fluency appears reduced; slower, structured practice will help.")

    return " ".join(parts)


def _build_insights(
    num_segments: int,
    avg_segment: float,
    speech_ratio: float,
    zcr_std: float,
) -> List[str]:
    """
    Turn raw features into bite-sized insights for the UI.
    """
    insights: List[str] = []

    insights.append(
        f"We detected around {num_segments} speech bursts with an average length of {avg_segment:.2f} seconds."
    )

    if num_segments > 20 and avg_segment < 0.35:
        insights.append(
            "There are many very short bursts, which can be related to repetitions or blocks often found in stuttering."
        )
    elif num_segments < 8 and avg_segment > 0.7:
        insights.append(
            "Your phrases are longer and more connected, which usually supports smoother fluency."
        )

    if speech_ratio < 0.25:
        insights.append(
            "There was relatively little active speech; try a longer recording (10–20 seconds) for a clearer picture."
        )

    if zcr_std > 0.08:
        insights.append(
            "There is a lot of variation in consonant energy, which can sometimes relate to articulation clarity."
        )

    if not insights:
        insights.append("We could not extract strong patterns; try speaking a short sentence at a natural pace.")

    return insights


def _build_exercises(stuttering: int, lisp: int, level: str) -> List[Dict]:
    """
    Generate simple practice exercises tailored to the detected patterns.
    These do NOT replace a real speech therapist, but can be used as guided practice.
    """
    exercises: List[Dict] = []

    # Stuttering-focused drills
    if stuttering >= 40:
        exercises.append(
            {
                "title": "Easy Onset Breathing",
                "focus": "stuttering",
                "description": "Slow your breathing and gently start each phrase with relaxed airflow.",
                "script": "Take a deep breath, then say: 'I am speaking slowly and smoothly today.'",
            }
        )
        exercises.append(
            {
                "title": "Slow Stretch Phrases",
                "focus": "stuttering",
                "description": "Stretch the first sound in each word slightly to reduce tension and blocks.",
                "script": "Practice: 'Ssssara sssaid sssunny sssaturdays are ssspecial.'",
            }
        )

    # Lisp-focused drills
    if lisp >= 40:
        exercises.append(
            {
                "title": "Tongue Placement for 'S'",
                "focus": "lisp",
                "description": "Keep the tongue just behind the teeth without touching them to sharpen the 's' sound.",
                "script": "Practice: 'See the sun, see the sea, see the silver sand.'",
            }
        )
        exercises.append(
            {
                "title": "Minimal Pairs: S vs TH",
                "focus": "lisp",
                "description": "Contrast similar sounds to build awareness of tongue placement.",
                "script": "Practice pairs: 'sip / thip', 'sink / think', 'sick / thick'.",
            }
        )

    # General fluency drills
    if level in {"balanced", "targeted"}:
        exercises.append(
            {
                "title": "Paced Reading",
                "focus": "fluency",
                "description": "Read a short sentence in a calm, even rhythm with small pauses.",
                "script": "Practice with any short paragraph, tapping your finger gently for each word.",
            }
        )

    if not exercises:
        exercises.append(
            {
                "title": "Warm-up Phrases",
                "focus": "general",
                "description": "Use this as a gentle warm-up and to gather more audio.",
                "script": "Say: 'Today I am practicing clear and confident speech.' three times.",
            }
        )

    return exercises


def analyze_speech(path: str) -> Dict:
    """
    Main entry point for speech analysis.

    This uses lightweight, heuristic DSP features to approximate:
    - stuttering-like patterns (many short bursts, irregular rhythm)
    - lisp-like coloration (very rough spectral proxy)
    - overall fluency

    It is *not* a medical or diagnostic tool, but can guide practice.
    """
    # Load audio as mono at 16 kHz for consistent analysis.
    y, sr = librosa.load(path, sr=16_000, mono=True)
    if y.size == 0:
        raise ValueError("Empty audio signal.")

    duration = float(librosa.get_duration(y=y, sr=sr))
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Invalid audio duration.")

    hop_length = 512
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    zcr = librosa.feature.zero_crossing_rate(y=y, hop_length=hop_length)[0]
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]

    segments = _segment_speech(rms, sr, hop_length)
    num_segments = len(segments)
    segment_durations = [end - start for start, end in segments] or [0.0]
    avg_segment = float(np.mean(segment_durations))
    short_segments = sum(1 for d in segment_durations if d < 0.25)

    # Ratio of frames with clearly voiced content.
    speech_threshold = 0.1 * float(np.max(rms)) if rms.size else 0.0
    speech_ratio = float(np.mean(rms > speech_threshold)) if speech_threshold > 0 else 0.0

    zcr_std = float(np.std(zcr)) if zcr.size else 0.0
    centroid_mean = float(np.mean(centroid)) if centroid.size else 0.0
    centroid_std = float(np.std(centroid)) if centroid.size else 0.0

    # --- Heuristic scores -------------------------------------------------
    # Stuttering: dense short segments and high burst rate.
    stutter_density = short_segments / max(duration, 1e-3)
    burst_rate = num_segments / max(duration, 1e-3)
    stuttering_raw = 0.7 * stutter_density + 0.3 * burst_rate
    stuttering_score = _safe_scale(stuttering_raw, 0.2, 2.5)

    # Lisp: very rough proxy using lower-average spectral centroid and high variance.
    # This is purely heuristic and *not* diagnostic.
    lisp_raw = (2_000.0 - min(centroid_mean, 4_000.0)) / 2_000.0 + centroid_std / 1_000.0
    lisp_score = _safe_scale(lisp_raw, 0.2, 2.0)

    # Fluency: higher when stuttering and lisp scores are lower and speech_ratio is moderate.
    fluency_raw = 1.5 - 0.01 * stuttering_score - 0.01 * lisp_score + 0.5 * (speech_ratio - 0.3)
    fluency_score = _safe_scale(fluency_raw, 0.3, 1.8)

    # Clamp scores
    stuttering_score = max(0, min(100, stuttering_score))
    lisp_score = max(0, min(100, lisp_score))
    fluency_score = max(0, min(100, fluency_score))

    if stuttering_score >= 70 or lisp_score >= 70:
        level = "intense"
    elif stuttering_score >= 40 or lisp_score >= 40:
        level = "targeted"
    else:
        level = "balanced"

    summary = _build_summary(stuttering_score, lisp_score, fluency_score)
    insights = _build_insights(num_segments, avg_segment, speech_ratio, zcr_std)
    exercises = _build_exercises(stuttering_score, lisp_score, level)

    return {
        "status": "success",
        "duration_seconds": round(duration, 2),
        "scores": {
            "stuttering": stuttering_score,
            "lisp": lisp_score,
            "fluency": fluency_score,
        },
        "summary": summary,
        "insights": insights,
        "exercises": exercises,
        "level": level,
    }

