"""BountyRegistry — evaluator için okuma/yazma katmanı."""

import json
from pathlib import Path
from web3 import Web3

ABI_PATH = Path(__file__).parent.parent / "agent" / "abi.json"

TASK_STATUS = {0: "OPEN", 1: "LOCKED", 2: "COMPLETED", 3: "CANCELLED"}


class TaskContract:
    def __init__(self, w3: Web3, address: str):
        abi = json.loads(ABI_PATH.read_text())
        self.contract = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=abi,
        )
        self.w3 = w3

    # ── Read ─────────────────────────────────────────────────────────────

    def task_count(self) -> int:
        return self.contract.functions.taskCount().call()

    def get_task(self, task_id: int) -> dict:
        t = self.contract.functions.getTask(task_id).call()
        return {
            "id":            task_id,
            "creator":       t[0],
            "title":         t[1],
            "description":   t[2],
            "taskHash":      t[3].hex(),
            "reward":        t[4],
            "reward_usdc":   float(self.w3.from_wei(t[4], "ether")),
            "stakeRequired": t[5],
            "deadline":      t[6],
            "evaluator":     t[7],
            "status":        TASK_STATUS.get(t[8], t[8]),
            "agent":         t[9],
            "agentStake":    t[10],
            "takenAt":       t[11],
            "resultHash":    t[12].hex(),
            "resultText":    t[13],
        }

    def get_pending_evaluations(self, evaluator_address: str) -> list[dict]:
        """Bu evaluator'ı bekleyen, submit edilmiş ama henüz değerlendirilmemiş taskler."""
        count = self.task_count()
        pending = []
        for i in range(1, count + 1):
            t = self.get_task(i)
            if (
                t["status"] == "LOCKED"
                and t["evaluator"].lower() == evaluator_address.lower()
                and t["resultHash"] != "0" * 64  # submit edilmiş
            ):
                pending.append(t)
        return pending

    # ── Write ────────────────────────────────────────────────────────────

    def build_approve_tx(self, task_id: int, sender: str) -> dict:
        return self.contract.functions.approveResult(task_id).build_transaction({
            "from":  Web3.to_checksum_address(sender),
            "nonce": self.w3.eth.get_transaction_count(Web3.to_checksum_address(sender)),
        })

    def build_reject_tx(self, task_id: int, sender: str) -> dict:
        return self.contract.functions.rejectResult(task_id).build_transaction({
            "from":  Web3.to_checksum_address(sender),
            "nonce": self.w3.eth.get_transaction_count(Web3.to_checksum_address(sender)),
        })
