# SpeakEase – AI-Powered Speech Practice (Stuttering & Lisp)

SpeakEase is a small web app that lets you record short speech samples and get
heuristic AI-style feedback on:

- Stuttering-like patterns
- Lisp-like articulation patterns
- Overall fluency

It also generates focused practice exercises you can follow along with.

> **Important:** This is a learning/practice tool only. It does **not** replace
> a licensed speech-language pathologist or provide a medical diagnosis.

## How it works

- **Frontend (browser):**
  - Records your voice using the `MediaRecorder` API.
  - Sends the audio to the backend as a small `webm` file.
  - Shows scores, a text summary, insights, and practice exercises.

- **Backend (Python + Flask):**
  - Receives your audio and saves it to the `uploads/` folder.
  - Uses `librosa` + `numpy` to compute simple audio features.
  - Builds **heuristic scores** for stuttering, lisp, and fluency.
  - Returns JSON with scores, a human-readable summary, insights, and
    practice exercises.

## Setup & run

1. **Create and activate a virtual environment (optional but recommended):**

   ```bash
   cd speech_therapy_ai
   python -m venv venv
   .\venv\Scripts\activate  # on Windows PowerShell
   ```

2. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

3. **Run the app:**

   ```bash
   python app.py
   ```

4. **Open in your browser:**

   Go to `http://127.0.0.1:5000` and:

   - Click **“Start speaking”**.
   - Talk for **10–20 seconds**.
   - Click **“Stop & analyze”**.
   - Review your scores and suggested exercises.

## Notes & limitations

- The analysis is based on basic digital signal processing heuristics, not a
  clinically validated model.
- Different microphones and environments can affect the scores; use this more
  as a **relative** indicator than an absolute measurement.
- For real concerns about stuttering, lisp, or other communication disorders,
  please reach out to a certified speech-language pathologist.

