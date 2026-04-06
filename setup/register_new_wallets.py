"""
Yeni 3 wallet'ı Arc IdentityRegistry'e kaydet.
Usage: python3 setup/register_new_wallets.py
"""

import os
import time
import base64
import requests
from uuid import uuid4
from dotenv import load_dotenv
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from web3 import Web3

load_dotenv()

def require_env(key):
    val = os.getenv(key)
    if not val:
        raise SystemExit(f"Hata: .env dosyasında '{key}' tanımlı değil. .env.example dosyasına bakın.")
    return val

API_KEY       = require_env("CIRCLE_API_KEY")
ENTITY_SECRET = require_env("CIRCLE_ENTITY_SECRET")
RPC_URL       = require_env("RPC_URL")
IDENTITY_REG  = require_env("IDENTITY_REGISTRY")
BASE          = "https://api.circle.com/v1/w3s"

WALLETS = [
    {
        "id":      require_env("CIRCLE_EVALUATOR2_WALLET_ID"),
        "address": require_env("CIRCLE_EVALUATOR2_ADDRESS"),
        "label":   "Evaluator 2 (Claude)",
        "name":    "evaluator2-claude",
    },
    {
        "id":      require_env("CIRCLE_EVALUATOR3_WALLET_ID"),
        "address": require_env("CIRCLE_EVALUATOR3_ADDRESS"),
        "label":   "Evaluator 3 (Gemini)",
        "name":    "evaluator3-gemini",
    },
    {
        "id":      require_env("CIRCLE_CREATOR_WALLET_ID"),
        "address": require_env("CIRCLE_CREATOR_ADDRESS"),
        "label":   "Creator Agent",
        "name":    "creator-agent",
    },
]

IDENTITY_ABI = [{"inputs":[{"internalType":"string","name":"name","type":"string"}],"name":"register","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]

w3 = Web3(Web3.HTTPProvider(RPC_URL))
identity = w3.eth.contract(address=Web3.to_checksum_address(IDENTITY_REG), abi=IDENTITY_ABI)


def get_ciphertext():
    resp = requests.get(f"{BASE}/config/entity/publicKey", headers={"Authorization": f"Bearer {API_KEY}"}, timeout=10)
    resp.raise_for_status()
    pub_pem = resp.json()["data"]["publicKey"]
    pub_key = serialization.load_pem_public_key(pub_pem.encode())
    encrypted = pub_key.encrypt(bytes.fromhex(ENTITY_SECRET), padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    return base64.b64encode(encrypted).decode()


def execute_contract(wallet_id, contract_address, fn_sig, params):
    ciphertext = get_ciphertext()
    resp = requests.post(
        f"{BASE}/developer/transactions/contractExecution",
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json={
            "idempotencyKey": str(uuid4()),
            "walletId": wallet_id,
            "contractAddress": contract_address,
            "abiFunctionSignature": fn_sig,
            "abiParameters": params,
            "feeLevel": "MEDIUM",
            "entitySecretCiphertext": ciphertext,
        },
        timeout=30,
    )
    if not resp.ok:
        print(f"    Hata: {resp.status_code} — {resp.json()}")
        raise Exception("TX failed")
    return resp.json()["data"]["id"]


def wait_tx(tx_id):
    for _ in range(60):
        time.sleep(2)
        resp = requests.get(f"{BASE}/transactions/{tx_id}", headers={"Authorization": f"Bearer {API_KEY}"}, timeout=10)
        state = resp.json()["data"]["transaction"]["state"]
        if state == "COMPLETE":
            tx_hash = resp.json()["data"]["transaction"].get("txHash", "")
            print(f"    ✓ TX: {tx_hash}")
            return True
        if state in ("FAILED", "DENIED", "CANCELLED"):
            print(f"    ✗ Başarısız: {state}")
            return False
    print("    ✗ Timeout")
    return False


for w in WALLETS:
    print(f"\n{w['label']} ({w['address']})")
    balance = identity.functions.balanceOf(Web3.to_checksum_address(w["address"])).call()
    if balance > 0:
        print("  ✓ Zaten kayıtlı, atlanıyor.")
        continue
    print("  Kayıt ediliyor...")
    tx_id = execute_contract(w["id"], IDENTITY_REG, "register(string)", [w["name"]])
    wait_tx(tx_id)

print("\nTamamlandı.")
