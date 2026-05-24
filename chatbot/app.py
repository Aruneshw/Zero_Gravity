import os
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SITE_DIR = BASE_DIR.parent / "zero_gravity (1)" / "zero_gravity"
SITE_DIR = DEFAULT_SITE_DIR if DEFAULT_SITE_DIR.exists() else BASE_DIR
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi")

app = Flask(__name__, static_folder=str(SITE_DIR), static_url_path="")

chat_history = []


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


def serve_site_file(filename):
    return send_from_directory(str(SITE_DIR), filename)


@app.route("/")
def home():
    return serve_site_file("index.html")

@app.route("/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    user_message = (payload.get("message") or "").strip()

    if not user_message:
        return jsonify({"reply": "Please enter a message before sending."}), 400

    print("User:", user_message)

    chat_history.append(f"User: {user_message}")
    context = "\n".join(chat_history[-6:])

    prompt = f"""
You are a professional AI chatbot for a startup website.

Rules:
- Give short, clear answers
- Maximum 2-3 lines
- No markdown (#, ###)
- No examples or suggestions
- No explanations unless asked
- Be friendly and natural

Conversation:
{context}

User: {user_message}
Bot:
"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": 120},
            },
            timeout=60,
        )
        response.raise_for_status()
        reply = response.json().get("response", "").strip()
    except requests.RequestException:
        reply = "The AI service is unavailable right now. Please make sure Ollama is running."
    except ValueError:
        reply = "The AI service returned an invalid response. Please try again."

    if not reply:
        reply = "I could not generate a reply right now. Please try again."

    chat_history.append(f"Bot: {reply}")

    print("Bot:", reply)

    return jsonify({"reply": reply})


@app.route("/<path:filename>")
def site_files(filename):
    return serve_site_file(filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
