(() => {
  const recordButton = document.getElementById("recordButton");
  const recordButtonLabel = document.getElementById("recordButtonLabel");
  const pulseCircle = document.getElementById("pulseCircle");
  const statusText = document.getElementById("statusText");
  const timerText = document.getElementById("timerText");

  const stutteringBar = document.getElementById("stutteringBar");
  const lispBar = document.getElementById("lispBar");
  const fluencyBar = document.getElementById("fluencyBar");
  const stutteringScoreText = document.getElementById("stutteringScore");
  const lispScoreText = document.getElementById("lispScore");
  const fluencyScoreText = document.getElementById("fluencyScore");
  const durationText = document.getElementById("durationText");

  const summaryText = document.getElementById("summaryText");
  const insightsList = document.getElementById("insightsList");
  const exercisesContainer = document.getElementById("exercisesContainer");
  const planBadge = document.getElementById("planBadge");
  const voiceButton = document.getElementById("voiceButton");
  const startPracticeButton = document.getElementById("startPracticeButton");
  const playWordButton = document.getElementById("playWordButton");
  const repeatWordButton = document.getElementById("repeatWordButton");
  const practiceWordText = document.getElementById("practiceWordText");
  const practiceProgressText = document.getElementById("practiceProgressText");
  const practiceFeedbackText = document.getElementById("practiceFeedbackText");
  const practiceStatusBadge = document.getElementById("practiceStatusBadge");

  let mediaRecorder = null;
  let chunks = [];
  let isRecording = false;
  let timerId = null;
  let startTime = null;
  let lastAnalysisForVoice = null;
  let currentRecordingPurpose = "analysis";

  const MAX_PRACTICE_ATTEMPTS = 3;
  const PRACTICE_LISP_THRESHOLD = 40;
  const PRACTICE_STUTTER_THRESHOLD = 40;

  const practiceState = {
    active: false,
    words: [],
    currentIndex: 0,
    attemptsOnWord: 0,
    busy: false,
  };

  function pickRecordingMimeType() {
    if (typeof MediaRecorder === "undefined") {
      return "";
    }
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    for (const type of candidates) {
      if (
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported(type)
      ) {
        return type;
      }
    }
    return "";
  }

  function extensionFromMimeType(mimeType) {
    const value = (mimeType || "").toLowerCase();
    if (value.includes("webm")) return "webm";
    if (value.includes("ogg")) return "ogg";
    if (value.includes("mp4")) return "mp4";
    if (value.includes("wav")) return "wav";
    return "webm";
  }

  function setPracticeBusy(busy) {
    practiceState.busy = busy;
    if (repeatWordButton) {
      repeatWordButton.disabled = busy || !practiceState.active;
    }
    if (playWordButton) {
      playWordButton.disabled = busy || !practiceState.active;
    }
    if (startPracticeButton) {
      startPracticeButton.disabled = busy;
    }
  }

  function setPracticeBadge(text) {
    if (practiceStatusBadge) {
      practiceStatusBadge.textContent = text;
    }
  }

  function getCurrentPracticeWord() {
    return practiceState.words[practiceState.currentIndex] || null;
  }

  function updatePracticeUI() {
    if (!practiceWordText || !practiceProgressText) return;
    const currentWord = getCurrentPracticeWord();
    const total = practiceState.words.length;
    if (!practiceState.active || !currentWord) {
      practiceWordText.textContent = "-";
      practiceProgressText.textContent = "Press \"Start word practice\" to begin.";
      setPracticeBadge("Idle");
      return;
    }

    practiceWordText.textContent = currentWord;
    practiceProgressText.textContent = `Word ${practiceState.currentIndex + 1} of ${total} - Attempt ${Math.max(
      1,
      practiceState.attemptsOnWord + 1
    )}/${MAX_PRACTICE_ATTEMPTS}`;
    setPracticeBadge("In progress");
  }

  function buildPracticeWordsFromLatestAnalysis() {
    const stut = Number(lastAnalysisForVoice?.scores?.stuttering || 0);
    const lisp = Number(lastAnalysisForVoice?.scores?.lisp || 0);
    const words = [];

    if (lisp >= PRACTICE_LISP_THRESHOLD) {
      words.push("sun", "see", "smile", "snake", "silver");
    }
    if (stut >= PRACTICE_STUTTER_THRESHOLD) {
      words.push("smooth", "steady", "story", "sunrise", "speaking");
    }
    if (!words.length) {
      words.push("hello", "sun", "story", "smile", "speech");
    }

    return [...new Set(words)];
  }

  function formatTime(seconds) {
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  }

  function updateTimer() {
    if (!startTime) return;
    const elapsed = (Date.now() - startTime) / 1000;
    timerText.textContent = formatTime(elapsed);
  }

  function setRecordingState(recording) {
    isRecording = recording;
    if (recording) {
      pulseCircle.classList.add("recording");
      recordButton.classList.add("recording");
      recordButtonLabel.textContent = "Stop & analyze";
      statusText.textContent = "Recording... speak in a calm, natural pace.";
      startTime = Date.now();
      timerText.textContent = "00:00";
      timerId = setInterval(updateTimer, 300);
    } else {
      pulseCircle.classList.remove("recording");
      recordButton.classList.remove("recording");
      recordButtonLabel.textContent = "Start speaking";
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    }
  }

  function setAnalyzingState(analyzing) {
    recordButton.disabled = analyzing;
    if (analyzing) {
      statusText.textContent = "Analyzing your speech...";
    }
  }

  function resetResults() {
    stutteringBar.style.width = "0%";
    lispBar.style.width = "0%";
    fluencyBar.style.width = "0%";
    stutteringScoreText.textContent = "–";
    lispScoreText.textContent = "–";
    fluencyScoreText.textContent = "–";
    durationText.textContent = "";
    summaryText.textContent =
      "Your personalized summary will appear here after your first recording.";
    insightsList.innerHTML = "";
    exercisesContainer.innerHTML = "";
    planBadge.textContent = "Ready to start";
  }

  function renderResults(data) {
    if (!data || data.status !== "success") {
      statusText.textContent =
        (data && data.message) ||
        "We couldn't analyze that recording. Please try again.";
      return;
    }

    const { scores, duration_seconds, summary, insights, exercises, level } =
      data;

    const stut = scores?.stuttering ?? 0;
    const lisp = scores?.lisp ?? 0;
    const flu = scores?.fluency ?? 0;

    stutteringBar.style.width = `${Math.max(0, Math.min(100, stut))}%`;
    lispBar.style.width = `${Math.max(0, Math.min(100, lisp))}%`;
    fluencyBar.style.width = `${Math.max(0, Math.min(100, flu))}%`;

    stutteringScoreText.textContent = `${stut}`;
    lispScoreText.textContent = `${lisp}`;
    fluencyScoreText.textContent = `${flu}`;

    if (duration_seconds != null) {
      durationText.textContent = `Analyzed about ${duration_seconds.toFixed(
        1
      )} seconds of speech.`;
    }

    summaryText.textContent = summary || "Analysis complete.";

    insightsList.innerHTML = "";
    if (Array.isArray(insights) && insights.length) {
      insights.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        insightsList.appendChild(li);
      });
    }

    exercisesContainer.innerHTML = "";
    if (Array.isArray(exercises) && exercises.length) {
      exercises.forEach((ex) => {
        const wrapper = document.createElement("div");
        wrapper.className = "exercise";

        const header = document.createElement("div");
        header.className = "exercise-header";

        const title = document.createElement("div");
        title.className = "exercise-title";
        title.textContent = ex.title || "Exercise";

        const tag = document.createElement("div");
        const focus = ex.focus || "general";
        tag.className = `exercise-tag ${focus}`;
        tag.textContent =
          focus === "stuttering"
            ? "Stuttering"
            : focus === "lisp"
            ? "Lisp"
            : focus === "fluency"
            ? "Fluency"
            : "General";

        header.appendChild(title);
        header.appendChild(tag);

        const desc = document.createElement("div");
        desc.className = "exercise-body";
        desc.textContent =
          ex.description ||
          "Use this exercise as a short, focused speech practice.";

        const script = document.createElement("div");
        script.className = "exercise-script";
        script.textContent = ex.script || "";

        wrapper.appendChild(header);
        wrapper.appendChild(desc);
        if (ex.script) {
          wrapper.appendChild(script);
        }

        exercisesContainer.appendChild(wrapper);
      });
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "exercise-body";
      placeholder.textContent =
        "Run an analysis to unlock personalized practice exercises.";
      exercisesContainer.appendChild(placeholder);
    }

    if (level === "intense") {
      planBadge.textContent = "Focused practice";
    } else if (level === "targeted") {
      planBadge.textContent = "Targeted practice";
    } else {
      planBadge.textContent = "Gentle warm-up";
    }

    // Store latest analysis for the AI voice coach.
    lastAnalysisForVoice = {
      scores: scores || {},
      duration_seconds: duration_seconds ?? null,
      summary: summary || "",
      insights: Array.isArray(insights) ? insights : [],
      exercises: Array.isArray(exercises) ? exercises : [],
      level: level || "balanced",
    };

    statusText.textContent =
      "Analysis ready. Scroll down to review your insights and exercises.";
  }

  async function uploadAudioForAnalysis(blob, mimeType) {
    const formData = new FormData();
    const ext = extensionFromMimeType(mimeType || blob?.type);
    formData.append("audio", blob, `speech.${ext}`);

    const response = await fetch("/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        (data && data.message) || "Server returned an error while analyzing."
      );
    }
    return data;
  }

  function playCurrentPracticeWord() {
    const word = getCurrentPracticeWord();
    if (!word) {
      statusText.textContent = "Start word practice first.";
      return;
    }
    if (!browserSupportsVoice()) {
      statusText.textContent =
        "Voice playback is not supported in this browser. Read the word and continue.";
      return;
    }

    const utterance = new window.SpeechSynthesisUtterance(
      `Repeat this word clearly: ${word}`
    );
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error(err);
    }
  }

  function moveToNextPracticeWord() {
    practiceState.currentIndex += 1;
    practiceState.attemptsOnWord = 0;

    if (practiceState.currentIndex >= practiceState.words.length) {
      practiceState.active = false;
      updatePracticeUI();
      setPracticeBusy(false);
      if (practiceFeedbackText) {
        practiceFeedbackText.textContent =
          "Word practice complete. Great work. Start again anytime.";
      }
      statusText.textContent = "Word practice complete.";
      setPracticeBadge("Complete");
      return;
    }

    updatePracticeUI();
    playCurrentPracticeWord();
  }

  function handlePracticeResult(data) {
    const stut = Number(data?.scores?.stuttering || 0);
    const lisp = Number(data?.scores?.lisp || 0);
    const needsMoreWork =
      stut >= PRACTICE_STUTTER_THRESHOLD || lisp >= PRACTICE_LISP_THRESHOLD;
    const currentWord = getCurrentPracticeWord();

    if (!currentWord) {
      return;
    }

    if (!needsMoreWork) {
      if (practiceFeedbackText) {
        practiceFeedbackText.textContent = `Good repetition for "${currentWord}". Moving to next word.`;
      }
      moveToNextPracticeWord();
      return;
    }

    practiceState.attemptsOnWord += 1;
    if (practiceState.attemptsOnWord >= MAX_PRACTICE_ATTEMPTS) {
      if (practiceFeedbackText) {
        practiceFeedbackText.textContent = `You practiced "${currentWord}" ${MAX_PRACTICE_ATTEMPTS} times. Moving to next word now.`;
      }
      moveToNextPracticeWord();
      return;
    }

    updatePracticeUI();
    if (practiceFeedbackText) {
      practiceFeedbackText.textContent = `Keep practicing "${currentWord}". Try ${
        practiceState.attemptsOnWord + 1
      } of ${MAX_PRACTICE_ATTEMPTS}.`;
    }
    playCurrentPracticeWord();
  }

  async function sendRecordingToBackend(blob, mimeType) {
    setAnalyzingState(true);
    try {
      const data = await uploadAudioForAnalysis(blob, mimeType);
      renderResults(data);
    } catch (err) {
      console.error(err);
      statusText.textContent =
        err?.message ||
        "Something went wrong while sending the recording. Please try again.";
    } finally {
      setAnalyzingState(false);
    }
  }

  async function sendPracticeAttempt(blob, mimeType) {
    setPracticeBusy(true);
    try {
      statusText.textContent = "Checking your repetition...";
      const data = await uploadAudioForAnalysis(blob, mimeType);
      renderResults(data);
      handlePracticeResult(data);
    } catch (err) {
      console.error(err);
      statusText.textContent =
        err?.message || "Could not analyze your practice attempt.";
    } finally {
      setPracticeBusy(false);
    }
  }

  async function startRecording(purpose = "analysis") {
    currentRecordingPurpose = purpose;
    if (purpose === "analysis") {
      resetResults();
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusText.textContent =
        "Your browser does not support microphone access. Try Chrome or Edge on desktop.";
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      const mimeType = pickRecordingMimeType();
      mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const actualType = mediaRecorder.mimeType || chunks?.[0]?.type || "";
        const blob = new Blob(chunks, { type: actualType || "audio/webm" });
        chunks = [];
        stream.getTracks().forEach((t) => t.stop());
        if (blob.size > 0) {
          if (currentRecordingPurpose === "practice") {
            sendPracticeAttempt(blob, actualType);
          } else {
            sendRecordingToBackend(blob, actualType);
          }
        } else {
          statusText.textContent =
            "We didn't capture any audio. Please try recording again.";
        }
      };

      mediaRecorder.start();
      setRecordingState(true);
    } catch (err) {
      console.error(err);
      statusText.textContent =
        "We couldn't access your microphone. Please allow microphone permissions.";
      setRecordingState(false);
    }
  }

  function stopRecording() {
    if (!mediaRecorder) return;
    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    setRecordingState(false);
  }

  recordButton.addEventListener("click", () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  function startWordPracticeSession() {
    if (isRecording) {
      statusText.textContent = "Stop the current recording before word practice.";
      return;
    }
    practiceState.active = true;
    practiceState.words = buildPracticeWordsFromLatestAnalysis();
    practiceState.currentIndex = 0;
    practiceState.attemptsOnWord = 0;
    if (practiceFeedbackText) {
      practiceFeedbackText.textContent =
        "Listen to the word and repeat it clearly.";
    }
    updatePracticeUI();
    setPracticeBusy(false);
    playCurrentPracticeWord();
  }

  if (startPracticeButton) {
    startPracticeButton.addEventListener("click", startWordPracticeSession);
  }

  if (playWordButton) {
    playWordButton.addEventListener("click", () => {
      if (!practiceState.active) {
        statusText.textContent = "Start word practice first.";
        return;
      }
      playCurrentPracticeWord();
    });
  }

  if (repeatWordButton) {
    repeatWordButton.addEventListener("click", () => {
      if (!practiceState.active) {
        statusText.textContent = "Start word practice first.";
        return;
      }
      if (isRecording) {
        statusText.textContent = "A recording is already running.";
        return;
      }
      statusText.textContent = `Repeat "${getCurrentPracticeWord()}" clearly now.`;
      startRecording("practice");
    });
  }

  // Initialize
  resetResults();
  updatePracticeUI();
  setPracticeBusy(false);

  function browserSupportsVoice() {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof window.SpeechSynthesisUtterance !== "undefined"
    );
  }

  function playVoiceCoach() {
    if (!browserSupportsVoice()) {
      statusText.textContent =
        "Your browser does not support spoken feedback. Try the latest Chrome or Edge on desktop.";
      return;
    }

    if (!lastAnalysisForVoice) {
      statusText.textContent =
        "Record once to unlock the AI voice coach, then try again.";
      return;
    }

    const analysis = lastAnalysisForVoice;
    const parts = [];

    parts.push("Here is what I heard.");

    if (analysis.summary) {
      parts.push(analysis.summary);
    }

    const s = analysis.scores || {};
    if (
      typeof s.stuttering === "number" ||
      typeof s.lisp === "number" ||
      typeof s.fluency === "number"
    ) {
      const st = typeof s.stuttering === "number" ? s.stuttering : 0;
      const li = typeof s.lisp === "number" ? s.lisp : 0;
      const fl = typeof s.fluency === "number" ? s.fluency : 0;
      parts.push(
        `Your stuttering score is ${st} out of 100, your lisp score is ${li}, and your fluency score is ${fl}.`
      );
    }

    if (Array.isArray(analysis.exercises) && analysis.exercises.length) {
      parts.push("Here are a couple of ideas for practice.");
      analysis.exercises.slice(0, 2).forEach((ex) => {
        const title = ex.title || "Exercise";
        const desc =
          ex.description ||
          "Use this as a short, focused drill for your speech.";
        parts.push(`${title}. ${desc}`);
      });
    }

    const utterance = new window.SpeechSynthesisUtterance(parts.join(" "));
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      statusText.textContent =
        "Playing your AI coach. You can record again when it finishes.";
    };

    utterance.onend = () => {
      statusText.textContent =
        "Analysis ready. Scroll down to review your insights and exercises.";
    };

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error(err);
      statusText.textContent =
        "We couldn't start the voice coach. Please try again or refresh the page.";
    }
  }

  if (voiceButton) {
    voiceButton.addEventListener("click", playVoiceCoach);

    if (!browserSupportsVoice()) {
      voiceButton.disabled = true;
      voiceButton.textContent = "Voice coach not supported in this browser";
    }
  }

  if (playWordButton && !browserSupportsVoice()) {
    playWordButton.disabled = true;
    playWordButton.textContent = "Word voice not supported";
  }
})();

