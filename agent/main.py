"""
Agon — Worker Agent

Flow:
  1. Açık task'ları tara
  2. Uygun task bul → takeTask() ile kilitle (stake yatır)
  3. Görevi çalıştır (wallet analizi)
  4. submitResult() ile sonucu gönder
  5. Evaluator gateway'e $0.001 USDC nanopayment yaparak değerlendirme tetikle
  6. Gateway approve/reject tx'ini on-chain gönderir
"""

import os
import time
import json
import logging
import subprocess
import pathlib

from dotenv import load_dotenv
from web3 import Web3

from bounty import BountyContract
from analyzer import decode_target, analyze_wallet, report_to_result_hash, report_to_result_text

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("agent")

# ── Config ────────────────────────────────────────────────────────────────────

RPC_URL         = os.environ["RPC_URL"]
BOUNTY_REGISTRY = os.environ["BOUNTY_REGISTRY"]
POLL_INTERVAL   = int(os.getenv("POLL_INTERVAL", "30"))

# Circle DCW (öncelikli) veya private key (fallback)
USE_CIRCLE = bool(os.getenv("CIRCLE_WALLET_ID"))


def _make_wallet(w3: Web3):
    if USE_CIRCLE:
        from circle_wallet import CircleWallet
        blockchain = os.environ["CIRCLE_BLOCKCHAIN"]
        wallet_id  = os.environ["CIRCLE_WALLET_ID"]
        log.info("Cüzdan modu: Circle Developer-Controlled Wallet")
        return CircleWallet(wallet_id, blockchain, w3)
    else:
        from wallet import Wallet
        log.info("Cüzdan modu: Private Key (web3)")
        return Wallet(w3, os.environ["PRIVATE_KEY"])


# ── Task runner ───────────────────────────────────────────────────────────────

def run_task(w3: Web3, task: dict) -> tuple[bytes, str] | None:
    """
    taskHash convention: bytes32(uint160(targetWalletAddress))
    Son 20 byte'ı decode edip on-chain wallet analizi yapar.
    """
    target = decode_target(task["taskHash"])
    if target is None:
        log.warning(f"  #{task['id']} taskHash wallet adresi içermiyor, atlanıyor.")
        return None

    log.info(f"  Hedef wallet: {target}")
    report = analyze_wallet(w3, target)
    log.info(
        f"  Analiz tamamlandı — risk={report['risk_score']} ({report['risk_label']}), "
        f"balance={report['balance_usdc']} USDC"
    )

    os.makedirs("reports", exist_ok=True)
    out_path = f"reports/task_{task['id']}_{target[:8]}.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    log.info(f"  Rapor: {out_path}")

    return report_to_result_hash(report), report_to_result_text(report)


# ── Nanopayment evaluation ────────────────────────────────────────────────────

_PAY_EVALUATE_JS = pathlib.Path(__file__).parent / "pay_evaluate.js"

def pay_and_evaluate(task_id: int, title: str, description: str, result_text: str) -> dict | None:
    """
    Node.js pay_evaluate.js'i subprocess ile çağırır.
    Worker agent $0.001 USDC nanopayment yaparak evaluator gateway'den verdict alır.
    Gateway ayrıca approve/reject tx'ini on-chain gönderir.
    """
    try:
        proc = subprocess.run(
            [
                "node", str(_PAY_EVALUATE_JS),
                f"--task-id={task_id}",
                f"--title={title}",
                f"--description={description}",
                f"--result={result_text}",
            ],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(_PAY_EVALUATE_JS.parent),
        )
        if proc.returncode != 0:
            log.error(f"  pay_evaluate.js error: {proc.stderr.strip()}")
            return None
        return json.loads(proc.stdout.strip())
    except Exception as e:
        log.error(f"  pay_and_evaluate exception: {e}")
        return None


# ── On-chain actions ──────────────────────────────────────────────────────────

def take_task(wallet, contract: BountyContract, task: dict) -> str:
    """takeTask() çağır; tx hash döndür."""
    stake_wei = task["stakeRequired"]

    if USE_CIRCLE:
        stake_usdc = str(contract.w3.from_wei(stake_wei, "ether"))
        tx_id = wallet.execute_contract(
            BOUNTY_REGISTRY,
            "takeTask(uint256)",
            [str(task["id"])],
            native_amount=stake_usdc,
        )
        return wallet.wait(tx_id)
    else:
        tx = contract.build_take_tx(task["id"], stake_wei, wallet.address)
        tx_hash = wallet.sign_and_send(tx)
        wallet.wait(tx_hash)
        return tx_hash


def submit_result(wallet, contract: BountyContract, task_id: int, result_hash: bytes, result_text: str) -> str:
    """submitResult() çağır; tx hash döndür."""
    if USE_CIRCLE:
        tx_id = wallet.execute_contract(
            BOUNTY_REGISTRY,
            "submitResult(uint256,bytes32,string)",
            [str(task_id), "0x" + result_hash.hex(), result_text],
        )
        return wallet.wait(tx_id)
    else:
        tx = contract.build_submit_tx(task_id, result_hash, result_text, wallet.address)
        tx_hash = wallet.sign_and_send(tx)
        wallet.wait(tx_hash)
        return tx_hash


# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        raise ConnectionError(f"RPC bağlantısı kurulamadı: {RPC_URL}")

    wallet   = _make_wallet(w3)
    contract = BountyContract(w3, BOUNTY_REGISTRY)

    log.info(f"Agent adresi  : {wallet.address}")
    log.info(f"Bakiye        : {wallet.balance()}")
    log.info(f"Poll interval : {POLL_INTERVAL}s")
    log.info("─" * 50)

    # Restart sonrası chain'den mevcut locked task'ları kurtaR
    taken_ids: set[int] = set()
    submitted_ids: set[int] = set()
    gateway_pending: set[int] = set()
    recovered = contract.get_my_locked_tasks(wallet.address)
    if recovered:
        for t in recovered:
            taken_ids.add(t["id"])
        log.info(f"Chain'den {len(recovered)} locked task kurtarıldı: {[t['id'] for t in recovered]}")

    while True:
        try:
            _cycle(w3, wallet, contract, taken_ids, submitted_ids, gateway_pending)
        except KeyboardInterrupt:
            log.info("Çıkılıyor...")
            break
        except Exception as e:
            log.error(f"Döngü hatası: {e}", exc_info=True)

        time.sleep(POLL_INTERVAL)


def _cycle(w3, wallet, contract: BountyContract, taken_ids: set, submitted_ids: set, gateway_pending: set):
    now = int(time.time())

    # ── 0. Retry gateway evaluation for previously failed submissions ─────
    for tid in list(gateway_pending):
        task_data = contract.get_task(tid)
        result_text = task_data.get("resultText", "")
        if not result_text:
            continue
        log.info(f"  #{tid} gateway retry — nanopayment gönderiliyor...")
        verdict = pay_and_evaluate(tid, task_data.get("title", ""), task_data.get("description", ""), result_text)
        if verdict:
            log.info(f"  Verdict: {verdict.get('verdict')} (score={verdict.get('score')}) — {verdict.get('reason')}")
            log.info(f"  On-chain tx: {verdict.get('txHash')}")
            gateway_pending.discard(tid)
        else:
            log.warning(f"  #{tid} gateway retry başarısız, bir sonraki döngüde tekrar denenecek.")

    # ── 1. Zaten kilitlediğimiz task varsa submit et ──────────────────────
    for tid in list(taken_ids):
        if tid in submitted_ids:
            continue
        if not contract.is_my_locked_task(tid, wallet.address):
            taken_ids.discard(tid)
            continue

        task = contract.get_task(tid)
        if now >= task["deadline"]:
            log.warning(f"  #{tid} deadline geçti, submit edilemiyor.")
            taken_ids.discard(tid)
            continue

        log.info(f"  #{tid} aktif task — submit ediliyor...")
        result = run_task(w3, task)
        if result is None:
            continue

        result_hash, result_text = result
        tx_hash = submit_result(wallet, contract, tid, result_hash, result_text)
        log.info(f"  Submit tx: {tx_hash}")
        log.info(f"  #{tid} submit onaylandı — evaluator gateway'e nanopayment gönderiliyor...")

        task_data = contract.get_task(tid)
        verdict = pay_and_evaluate(tid, task_data.get("title", ""), task_data.get("description", ""), result_text)
        if verdict:
            log.info(f"  Verdict: {verdict.get('verdict')} (score={verdict.get('score')}) — {verdict.get('reason')}")
            log.info(f"  On-chain tx: {verdict.get('txHash')}")
        else:
            log.warning(f"  #{tid} nanopayment değerlendirme başarısız — sonraki döngüde retry edilecek.")
            gateway_pending.add(tid)

        submitted_ids.add(tid)

    # ── 2. Yeni açık task ara ─────────────────────────────────────────────
    open_tasks = contract.get_open_tasks()

    if not open_tasks:
        log.info("Açık task yok.")
        return

    log.info(f"{len(open_tasks)} açık task bulundu.")

    for task in open_tasks:
        tid = task["id"]

        if tid in taken_ids or tid in submitted_ids:
            continue
        if now >= task["deadline"]:
            log.info(f"  #{tid} deadline geçmiş, atlanıyor.")
            continue

        stake_wei = task["stakeRequired"]
        agent_balance = w3.eth.get_balance(Web3.to_checksum_address(wallet.address))
        if agent_balance < stake_wei:
            log.warning(
                f"  #{tid} stake için bakiye yetersiz "
                f"(gerekli={task['stake_usdc']} USDC, mevcut={wallet.balance()})"
            )
            continue

        log.info(
            f"  #{tid} '{task['title']}' — "
            f"reward={task['reward_usdc']} USDC, stake={task['stake_usdc']} USDC"
        )

        tx_hash = take_task(wallet, contract, task)
        log.info(f"  takeTask tx: {tx_hash}")
        log.info(f"  #{tid} task alındı, stake kilitlendi.")
        taken_ids.add(tid)
        break  # bir döngüde tek task al


if __name__ == "__main__":
    main()
