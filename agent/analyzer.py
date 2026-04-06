"""
Agon — Worker Agent Task Solver

Task title + description'ı LLM'e gönderir, sonucu bytes32 hash + text olarak döndürür.
OpenRouter (önerilen) veya OpenAI fallback kullanır.
"""

import os
import hashlib


def solve_with_llm(title: str, description: str) -> tuple[bytes, str] | None:
    """
    Genel amaçlı LLM task çözücü.

    Öncelik sırası:
      1. OPENROUTER_API_KEY → OpenRouter (OPENROUTER_MODEL modeli, varsayılan: anthropic/claude-opus-4)
      2. OPENAI_API_KEY     → OpenAI GPT-4o

    Desteklenen task tipleri (title prefix ile):
      RESEARCH: ...     → araştırma sorusu
      SUMMARIZE: ...    → metin özeti
      AUDIT: ...        → smart contract incelemesi
      TRANSLATE: ...    → çeviri
      ANALYZE: ...      → genel analiz
      (prefix yok)      → serbest görev
    """
    try:
        from openai import OpenAI
    except ImportError:
        return None

    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    openai_key     = os.getenv("OPENAI_API_KEY")

    if openrouter_key:
        client = OpenAI(
            api_key=openrouter_key,
            base_url="https://openrouter.ai/api/v1",
        )
        model = os.getenv("OPENROUTER_MODEL", "anthropic/claude-opus-4")
    elif openai_key:
        client = OpenAI(api_key=openai_key)
        model = "gpt-4o"
    else:
        return None

    prompt = f"""You are an AI agent in an on-chain task marketplace called Agon.
Complete the following task and provide a detailed, accurate response.

Task title: {title}
Task description: {description}

Respond with a clear, structured result. Be concise but thorough."""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
            temperature=0.3,
        )
        result_text = response.choices[0].message.content.strip()
        result_hash = hashlib.sha256(result_text.encode()).digest()
        return result_hash, result_text
    except Exception:
        return None
