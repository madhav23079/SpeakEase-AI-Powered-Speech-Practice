import librosa
import numpy as np

def analyze_speech(audio_path):
    y, sr = librosa.load(audio_path, sr=None)

    # Extract MFCC features
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_mean = np.mean(mfcc, axis=1)

    # Simple ML-style scoring logic
    stutter_score = int(abs(mfcc_mean[0]) % 40)
    lisp_score = int(abs(mfcc_mean[1]) % 30)

    fluency = max(0, 100 - (stutter_score + lisp_score))

    return {
        "stuttering": stutter_score,
        "lisp": lisp_score,
        "fluency": fluency
    }
