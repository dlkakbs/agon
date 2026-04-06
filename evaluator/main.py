"""
Agon — Evaluator Agent

Periyodik olarak on-chain task'ları tarar.
Submit edilmiş sonuçları GPT-4o ile değerlendirir.
Circle Developer-Controlled Wallet (veya fallback private key) ile approve/reject tx gönderir.

Worker agent'tan (Claude) farklı model kullanılır → bağımsız değerlendirme.
"""

import os
import sys
import time
import logging

from dotenv import load_dotenv
from web3 import Web3

from contract import TaskContract
from judge import Judge

# agent klasöründeki circle_wallet / wallet'ı import et
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "agent"))

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("evaluator")

# ── Config ────────────────────────────────────────────────────────────────────

RPC_URL         = os.environ["RPC_URL"]
BOUNTY_REGISTRY = os.environ["BOUNTY_REGISTRY"]
POLL_INTERVAL   = int(os.getenv("POLL_INTERVAL", "20"))

USE_CIRCLE = bool(os.getenv("CIRCLE_EVALUATOR_WALLET_ID"))


def _make_wallet(w3: Web3):
    if USE_CIRCLE:
        from circle_wallet import CircleWallet
        blockchain = os.environ["CIRCLE_BLOCKCHAIN"]
        wallet_id  = os.environ["CIRCLE_EVALUATOR_WALLET_ID"]
        log.info("Cüzdan modu: Circle Developer-Controlled Wallet")
        return CircleWallet(wallet_id, blockchain, w3)
    else:
        from wallet import Wallet
        log.info("Cüzdan modu: Private Key (web3)")
        return Wallet(w3, os.environ["EVALUATOR_PRIVATE_KEY"])


# ── On-chain actions ──────────────────────────────────────────────────────────

def approve_task(wallet, contract: TaskContract, task_id: int) -> str:
    if USE_CIRCLE:
        tx_id = wallet.execute_contract(
            BOUNTY_REGISTRY,
            "approveResult(uint256)",
            [str(task_id)],
        )
        return wallet.wait(tx_id)
    else:
        tx = contract.build_approve_tx(task_id, wallet.address)
        tx_hash = wallet.sign_and_send(tx)
        wallet.wait(tx_hash)
        return tx_hash


def reject_task(wallet, contract: TaskContract, task_id: int) -> str:
    if USE_CIRCLE:
        tx_id = wallet.execute_contract(
            BOUNTY_REGISTRY,
            "rejectResult(uint256)",
            [str(task_id)],
        )
        return wallet.wait(tx_id)
    else:
        tx = contract.build_reject_tx(task_id, wallet.address)
        tx_hash = wallet.sign_and_send(tx)
        wallet.wait(tx_hash)
        return tx_hash


# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        raise ConnectionError(f"RPC bağlantısı kurulamadı: {RPC_URL}")

    wallet   = _make_wallet(w3)
    contract = TaskContract(w3, BOUNTY_REGISTRY)
    judge    = Judge()

    log.info(f"Evaluator adresi : {wallet.address}")
    log.info(f"Bakiye           : {wallet.balance()}")
    log.info(f"Poll interval    : {POLL_INTERVAL}s")
    log.info(f"Model            : GPT-4o (bağımsız değerlendirme)")
    log.info("─" * 50)

    # (task_id, result_hash) çifti — aynı task reject sonrası yeni result gelirse tekrar değerlendir
    evaluated: set[tuple[int, str]] = set()

    while True:
        try:
            _cycle(wallet, contract, judge, evaluated)
        except KeyboardInterrupt:
            log.info("Çıkılıyor...")
            break
        except Exception as e:
            log.error(f"Döngü hatası: {e}", exc_info=True)

        time.sleep(POLL_INTERVAL)


def _cycle(wallet, contract: TaskContract, judge: Judge, evaluated: set):
    pending = contract.get_pending_evaluations(wallet.address)

    if not pending:
        log.info("Değerlendirilecek task yok.")
        return

    log.info(f"{len(pending)} task değerlendirme bekliyor.")

    for task in pending:
        tid = task["id"]
        key = (tid, task["resultHash"])

        if key in evaluated:
            continue

        log.info(f"─ Task #{tid}: '{task['title']}'")
        log.info(f"  Agent  : {task['agent']}")
        log.info(f"  Reward : {task['reward_usdc']} USDC")
        log.info(f"  Result : {task['resultText'][:120]}{'...' if len(task['resultText']) > 120 else ''}")

        try:
            verdict = judge.evaluate(task)
        except Exception as e:
            log.error(f"  Değerlendirme hatası: {e}")
            continue

        log.info(
            f"  Verdict: {verdict['verdict']} "
            f"(score={verdict['score']}/100) — {verdict['reason']}"
        )

        try:
            if verdict["verdict"] == "APPROVED":
                tx_hash = approve_task(wallet, contract, tid)
                log.info(f"  ✓ approveResult tx: {tx_hash}")
                log.info(f"  Task #{tid} ONAYLANDI → agent {task['reward_usdc']} USDC kazandı")
            else:
                tx_hash = reject_task(wallet, contract, tid)
                log.info(f"  ✗ rejectResult tx: {tx_hash}")
                log.info(f"  Task #{tid} REDDEDİLDİ → stake slash edildi, task OPEN'a döndü")
        except Exception as e:
            log.error(f"  TX hatası: {e}")
            continue

        evaluated.add(key)


if __name__ == "__main__":
    main()
