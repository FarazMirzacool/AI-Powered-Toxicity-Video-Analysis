import os
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
from moviepy import VideoFileClip
import whisper
from transformers import pipeline

app = Flask(__name__)
# Enable CORS so your frontend (running on a different port) can talk to Flask
CORS(app)

# Load models globally so they are ready when the request comes (faster first response)
print("Loading Whisper model (this may take a moment)...")
# 'base' is a good balance of speed and accuracy for a demo. Use 'tiny' if it's too slow.
whisper_model = whisper.load_model("base") 

print("Loading Toxicity classifier...")
toxicity_classifier = pipeline("text-classification", 
                               model="unitary/toxic-bert", 
                               top_k=None) # top_k=None returns all labels

# Mapping from toxic-bert labels to your frontend's category keys
LABEL_MAP = {
    'toxic': 'harassment', # Mapping generic toxicity to a broad category
    'severe_toxic': 'hate',
    'obscene': 'profanity',
    'threat': 'threat',
    'insult': 'harassment',
    'identity_hate': 'hate'
}

@app.route('/api/analyze', methods=['POST'])
def analyze_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    video_file = request.files['video']
    
    # Save the uploaded video to a temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp_video:
        video_file.save(tmp_video.name)
        video_path = tmp_video.name

    try:
        # 1. Extract Audio
        print("Extracting audio...")
        clip = VideoFileClip(video_path)
        duration = clip.duration
        audio_path = video_path.replace('.mp4', '.wav')
        clip.audio.write_audiofile(audio_path, logger=None)
        clip.close()

        # 2. Transcribe with Whisper
        print("Transcribing...")
        result = whisper_model.transcribe(audio_path, word_timestamps=False)
        segments = result['segments']

        # 3. Analyze segments for toxicity
        print("Analyzing toxicity...")
        flags = []
        for seg in segments:
            text = seg['text'].strip()
            if not text:
                continue
            
            # Get predictions from the model
            predictions = toxicity_classifier(text)[0]
            
            # Find the highest scoring non-neutral label
            # toxic-bert often has a 'neutral' label; we check for high scores in toxic labels
            for pred in predictions:
                label = pred['label'].lower()
                score = pred['score']
                
                # If a toxic label is detected with > 50% confidence
                if label in LABEL_MAP and score > 0.5:
                    # Map to your frontend structure
                    flags.append({
                        'id': f"f{len(flags)}",
                        'start': round(seg['start'], 2),
                        'end': round(seg['end'], 2),
                        'category': LABEL_MAP[label],
                        'categoryLabel': label.replace('_', ' ').title(),
                        'quote': text[:100] + ('...' if len(text) > 100 else ''),
                        'confidence': round(score, 2),
                        'severity': 'high' if score > 0.8 else 'medium' if score > 0.65 else 'low',
                        'color': '#ff4d4f' if score > 0.8 else '#f5a623' # Simple color logic
                    })
                    # Break after first strong toxic label to avoid duplicate flags for one segment
                    break 

        # 4. Construct the final report (matching your frontend's expected shape)
        # Calculate a rough overall score based on flags
        score = min(100, int(sum(f['confidence'] * 30 for f in flags)))
        
        # Build a simple heatmap (this is a simplified version)
        # In a real app, you might map flags to bins more accurately
        heat_bins = 120
        heat = [0] * heat_bins
        for f in flags:
            start_bin = int((f['start'] / duration) * heat_bins)
            end_bin = int((f['end'] / duration) * heat_bins)
            for i in range(start_bin, min(end_bin + 1, heat_bins)):
                heat[i] = max(heat[i], f['confidence'])

        # Platform verdicts (simplified logic)
        platforms = request.form.getlist('platforms[]') or ['youtube', 'tiktok', 'instagram', 'x']
        platform_verdicts = []
        for p in platforms:
            status = 'ok' if score < 30 else 'warn' if score < 60 else 'risk'
            platform_verdicts.append({'platform': p, 'label': p.capitalize(), 'status': status})

        # Recommendations
        recs = []
        if flags:
            recs.append(f"Review the {len(flags)} flagged segment(s) in the timeline.")
            if any(f['category'] == 'profanity' for f in flags):
                recs.append("Consider muting audio during segments marked as profanity.")
        else:
            recs.append("No fixes required — your video looks clean.")

        report = {
            'score': score,
            'overall': 'high' if score >= 55 else 'medium' if score >= 25 else 'low',
            'duration': duration,
            'flags': flags,
            'heat': heat,
            'heatBins': heat_bins,
            'platformVerdicts': platform_verdicts,
            'recommendations': recs,
            'analyzedAt': '2024-05-20T12:00:00Z' # Use datetime.now().isoformat() in real code
        }

        return jsonify(report)

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up temp files
        if os.path.exists(video_path): os.remove(video_path)
        if os.path.exists(audio_path): os.remove(audio_path)

if __name__ == '__main__':
    # Run on port 5000
    app.run(debug=True, port=5000)