"""
LLM Evaluator — GPT-4o kullanarak task sonuçlarını değerlendirir.

Kasıtlı olarak worker agent'tan (Claude) farklı model kullanılır:
bağımsız değerlendirme, sycophancy önlemi.
"""

import os
import json
import logging
from openai import OpenAI

log = logging.getLogger("evaluator.judge")

SYSTEM_PROMPT = """You are an impartial evaluator for an on-chain AI agent task marketplace called Agon.

Your job is to evaluate whether an AI agent's submitted result adequately fulfills the task requirements.

Rules:
- Be strict but fair. Partial results that miss key requirements should be REJECTED.
- A result is APPROVED if it directly and completely addresses the task description.
- A result is REJECTED if it is empty, irrelevant, incomplete, or clearly wrong.
- You MUST respond with valid JSON only. No extra text.

Response format:
{
  "verdict": "APPROVED" or "REJECTED",
  "score": 0-100,
  "reason": "one sentence explanation"
}
"""


class Judge:
    def __init__(self):
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY eksik")
        self.client = OpenAI(api_key=api_key)

    def evaluate(self, task: dict) -> dict:
        """
        Verilen task için sonucu değerlendir.
        Returns: {"verdict": "APPROVED"|"REJECTED", "score": int, "reason": str}
        """
        user_message = f"""Task Title: {task['title']}

Task Description:
{task['description']}

Agent's Submitted Result:
{task['resultText'] or '(empty)'}

Reward at stake: {task['reward_usdc']} USDC

Evaluate whether the agent's result fulfills the task requirements."""

        log.info(f"  GPT-4o değerlendiriyor — task #{task['id']} ...")

        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_message},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content
        result = json.loads(raw)

        verdict = result.get("verdict", "REJECTED").upper()
        if verdict not in ("APPROVED", "REJECTED"):
            verdict = "REJECTED"

        return {
            "verdict": verdict,
            "score":   int(result.get("score", 0)),
            "reason":  result.get("reason", ""),
        }
