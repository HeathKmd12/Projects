
besides the import os
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google.auth import exceptions as google_auth_exceptions
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from huggingface_hub import InferenceClient


PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "smart-tertiary-tech-learning")
HF_MODEL = os.environ.get("HF_MODEL", "HuggingFaceTB/SmolLM3-3B")
ALLOWED_ORIGIN = os.environ.get(
    "ALLOWED_ORIGIN", "https://smart-tertiary-tech-learning.web.app"
)

app = FastAPI(title="Smart Learning AI API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    subject: Optional[str] = Field(default=None, max_length=160)


def verify_firebase_user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Firebase authorization")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Invalid Firebase authorization")

    try:
        return id_token.verify_firebase_token(
            token, google_requests.Request(), audience=PROJECT_ID
        )
    except (ValueError, google_auth_exceptions.GoogleAuthError):
        raise HTTPException(status_code=401, detail="Invalid or expired Firebase token")


@app.get("/")
def health() -> dict:
    return {"service": "smart-learning-ai", "status": "ok"}


@app.post("/chat")
@app.post("/v1/ai/chat")
def chat(payload: ChatRequest, authorization: Optional[str] = Header(default=None)) -> dict:
    verify_firebase_user(authorization)
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        raise HTTPException(status_code=503, detail="AI service is not configured")

    context = f" The student is studying {payload.subject}." if payload.subject else ""
    prompt = (
        "You are a helpful, concise tertiary-learning assistant. "
        "Explain concepts clearly, show steps when useful, and do not invent sources."
        + context
    )

    try:
        client = InferenceClient(token=hf_token)
        result = client.chat.completions.create(
            model=HF_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": payload.message},
            ],
            max_tokens=700,
            temperature=0.4,
        )
        answer = result.choices[0].message.content.strip()
        return {"answer": answer}
    except Exception as error:
        print(f"Inference provider error: {type(error).__name__}: {error}", flush=True)
        raise HTTPException(status_code=502, detail="The AI provider is temporarily unavailable")

