"""
On-chain wallet risk analizi.

Bounty taskHash convention:
  taskHash = bytes32(uint160(targetWalletAddress))
  → agent son 20 byte'ı çözüp hedef adresi bulur.

Üretilen rapor:
  - balance
  - tx sayısı (nonce)
  - contract mi EOA mı
  - son bloklardaki aktivite
  - risk skoru (0-100)
"""

import os
import time
import hashlib
import json
from web3 import Web3


def decode_target(task_hash_hex: str) -> str | None:
    """taskHash'ten hedef wallet adresini çıkar."""
    raw = task_hash_hex.removeprefix("0x").removeprefix("0X")
    raw = raw.zfill(64)   # eksik sıfırları tamamla
    if len(raw) != 64:
        return None
    address_hex = "0x" + raw[-40:]
    try:
        return Web3.to_checksum_address(address_hex)
    except Exception:
        return None


def analyze_wallet(w3: Web3, address: str, scan_blocks: int = 200) -> dict:
    """
    Verilen adresin on-chain verisini çek, risk skoru üret.

    scan_blocks: kaç blok geriye gidilerek aktivite taransın
    """
    address = Web3.to_checksum_address(address)
    latest  = w3.eth.block_number

    # ── Temel veriler ──────────────────────────────────────────────────────
    balance_wei  = w3.eth.get_balance(address)
    balance_eth  = float(w3.from_wei(balance_wei, "ether"))
    nonce        = w3.eth.get_transaction_count(address)           # giden tx sayısı
    code         = w3.eth.get_code(address)
    is_contract  = len(code) > 2                                   # "0x" → EOA

    # ── Son N blokta aktivite ──────────────────────────────────────────────
    from_block = max(0, latest - scan_blocks)
    sent_txs: list[dict] = []
    recv_txs: list[dict] = []
    unique_counterparties: set[str] = set()

    for block_num in range(from_block, latest + 1):
        try:
            block = w3.eth.get_block(block_num, full_transactions=True)
        except Exception:
            continue
        for tx in block.transactions:
            tx_from = (tx.get("from") or "").lower()
            tx_to   = (tx.get("to")   or "").lower()
            addr_l  = address.lower()

            if tx_from == addr_l:
                entry = {
                    "hash":    tx["hash"].hex(),
                    "to":      tx.get("to"),
                    "value":   float(w3.from_wei(tx["value"], "ether")),
                    "block":   block_num,
                }
                sent_txs.append(entry)
                if tx.get("to"):
                    unique_counterparties.add(tx["to"].lower())

            elif tx_to == addr_l:
                entry = {
                    "hash":    tx["hash"].hex(),
                    "from":    tx["from"],
                    "value":   float(w3.from_wei(tx["value"], "ether")),
                    "block":   block_num,
                }
                recv_txs.append(entry)
                unique_counterparties.add(tx["from"].lower())

    total_sent  = sum(t["value"] for t in sent_txs)
    total_recv  = sum(t["value"] for t in recv_txs)

    # ── Risk skoru ────────────────────────────────────────────────────────
    # Düşük skor = düşük risk
    risk = 0

    # Hiç aktivite yok → bilinmiyor (nötr risk)
    if nonce == 0 and len(recv_txs) == 0:
        risk += 30

    # Çok fazla kısa sürede giden tx (olası bot/spam)
    if len(sent_txs) > 50:
        risk += 25

    # Çok fazla benzersiz karşı taraf (olası mixing)
    if len(unique_counterparties) > 30:
        risk += 20

    # Büyük tek transfer (whale hareketi)
    max_single = max((t["value"] for t in sent_txs), default=0)
    if max_single > 10_000:
        risk += 15

    # Contract adres (daha yüksek inceleme gerektirir)
    if is_contract:
        risk += 10

    risk = min(risk, 100)

    report = {
        "target":               address,
        "analyzed_at":          int(time.time()),
        "latest_block":         latest,
        "scanned_blocks":       scan_blocks,
        "balance_usdc":         round(balance_eth, 6),
        "outgoing_tx_count":    nonce,
        "is_contract":          is_contract,
        "recent_sent_count":    len(sent_txs),
        "recent_recv_count":    len(recv_txs),
        "recent_sent_volume":   round(total_sent, 6),
        "recent_recv_volume":   round(total_recv, 6),
        "unique_counterparties": len(unique_counterparties),
        "risk_score":           risk,
        "risk_label":           _risk_label(risk),
    }

    return report


def _risk_label(score: int) -> str:
    if score < 20:  return "LOW"
    if score < 50:  return "MEDIUM"
    if score < 75:  return "HIGH"
    return "CRITICAL"


def report_to_result_text(report: dict) -> str:
    """Raporu on-chain event log'una yazılacak JSON metnine çevir."""
    return json.dumps(report, sort_keys=True, indent=2)


def report_to_result_hash(report: dict) -> bytes:
    """Raporu deterministik bytes32 hash'e çevir (submit için)."""
    canonical = json.dumps(report, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).digest()


# ── LLM task solver ───────────────────────────────────────────────────────────

def solve_with_llm(title: str, description: str) -> tuple[bytes, str] | None:
    """
    Genel amaçlı LLM task çözücü.
    OPENROUTER_API_KEY varsa OpenRouter, yoksa OPENAI_API_KEY ile OpenAI kullanır.

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
    except Exception as e:
        return None
