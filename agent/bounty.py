"""BountyRegistry kontratıyla etkileşim katmanı — yeni contract interface."""

import json
from pathlib import Path
from web3 import Web3

ABI_PATH = Path(__file__).parent / "abi.json"

TASK_STATUS = {0: "OPEN", 1: "LOCKED", 2: "COMPLETED", 3: "CANCELLED"}


class BountyContract:
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
            "stake_usdc":    float(self.w3.from_wei(t[5], "ether")),
            "deadline":      t[6],
            "evaluator":     t[7],
            "status":        TASK_STATUS.get(t[8], t[8]),
            "agent":         t[9],
            "agentStake":    t[10],
            "takenAt":       t[11],
            "resultHash":    t[12].hex(),
            "resultText":    t[13],
        }

    def get_my_locked_tasks(self, agent_address: str) -> list[dict]:
        """Bu agent'ın üstlendiği ama henüz tamamlamadığı LOCKED task'ları döndürür."""
        count = self.task_count()
        locked = []
        for i in range(1, count + 1):
            t = self.get_task(i)
            if (
                t["status"] == "LOCKED"
                and t["agent"].lower() == agent_address.lower()
                and t["resultHash"] == "0" * 64
            ):
                locked.append(t)
        return locked

    def get_open_tasks(self) -> list[dict]:
        count = self.task_count()
        open_tasks = []
        for i in range(1, count + 1):
            t = self.get_task(i)
            if t["status"] == "OPEN":
                open_tasks.append(t)
        return open_tasks

    def is_my_locked_task(self, task_id: int, agent_address: str) -> bool:
        t = self.get_task(task_id)
        return (
            t["status"] == "LOCKED"
            and t["agent"].lower() == agent_address.lower()
        )

    def has_submitted(self, task_id: int, agent_address: str) -> bool:
        t = self.get_task(task_id)
        return (
            self.is_my_locked_task(task_id, agent_address)
            and t["resultHash"] != "0" * 64
        )

    # ── Write ────────────────────────────────────────────────────────────

    def build_take_tx(self, task_id: int, stake_wei: int, sender: str) -> dict:
        return self.contract.functions.takeTask(task_id).build_transaction({
            "from":  Web3.to_checksum_address(sender),
            "value": stake_wei,
            "nonce": self.w3.eth.get_transaction_count(Web3.to_checksum_address(sender)),
        })

    def build_submit_tx(
        self, task_id: int, result_hash: bytes, result_text: str, sender: str
    ) -> dict:
        return self.contract.functions.submitResult(
            task_id, result_hash, result_text
        ).build_transaction({
            "from":  Web3.to_checksum_address(sender),
            "nonce": self.w3.eth.get_transaction_count(Web3.to_checksum_address(sender)),
        })
