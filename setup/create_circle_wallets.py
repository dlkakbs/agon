"""
Circle Developer-Controlled Wallet kurulum scripti.

Agon için iki wallet oluşturur:
  1. Agent wallet   (takeTask + submitResult)
  2. Evaluator wallet (approveResult + rejectResult)

Çalıştırmadan önce .env'de şunlar olmalı:
  CIRCLE_API_KEY
  CIRCLE_ENTITY_SECRET
  CIRCLE_BLOCKCHAIN   (örn: "ARC-TESTNET")

Çıktı: .env'e eklenecek CIRCLE_WALLET_ID ve CIRCLE_EVALUATOR_WALLET_ID değerleri.

Kullanım:
  pip install requests cryptography
  python setup/create_circle_wallets.py
"""

import os
import base64
import requests
from uuid import uuid4
from dotenv import load_dotenv
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

load_dotenv()

API_KEY       = os.environ["CIRCLE_API_KEY"]
ENTITY_SECRET = os.environ["CIRCLE_ENTITY_SECRET"]
BLOCKCHAIN    = os.environ["CIRCLE_BLOCKCHAIN"]  # örn: "ARC-TESTNET"

BASE = "https://api.circle.com/v1/w3s"


def get_ciphertext() -> str:
    resp = requests.get(
        f"{BASE}/config/entity/publicKey",
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=10,
    )
    resp.raise_for_status()
    public_key_pem = resp.json()["data"]["publicKey"]

    secret_bytes = bytes.fromhex(ENTITY_SECRET)
    public_key   = serialization.load_pem_public_key(public_key_pem.encode())
    encrypted    = public_key.encrypt(
        secret_bytes,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(encrypted).decode()


def create_wallet_set(name: str) -> str:
    resp = requests.post(
        f"{BASE}/developer/walletSets",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type":  "application/json",
        },
        json={
            "idempotencyKey":          str(uuid4()),
            "entitySecretCiphertext":  get_ciphertext(),
            "name":                    name,
        },
        timeout=15,
    )
    resp.raise_for_status()
    wallet_set_id = resp.json()["data"]["walletSet"]["id"]
    print(f"  Wallet set oluşturuldu: {wallet_set_id}")
    return wallet_set_id


def create_wallet(wallet_set_id: str, name: str) -> dict:
    resp = requests.post(
        f"{BASE}/developer/wallets",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type":  "application/json",
        },
        json={
            "idempotencyKey":          str(uuid4()),
            "entitySecretCiphertext":  get_ciphertext(),
            "walletSetId":             wallet_set_id,
            "blockchains":             [BLOCKCHAIN],
            "count":                   1,
            "accountType":             "EOA",
            "metadata":                [{"name": name, "refId": name}],
        },
        timeout=15,
    )
    resp.raise_for_status()
    wallet = resp.json()["data"]["wallets"][0]
    return wallet


def main():
    print("=" * 50)
    print("Agon — Circle Wallet Kurulumu")
    print("=" * 50)
    print(f"Blockchain: {BLOCKCHAIN}\n")

    print("[1/2] Agent wallet set oluşturuluyor...")
    agent_set_id = create_wallet_set("Agon-Agent-WalletSet")

    print("[2/2] Wallet'lar oluşturuluyor...")
    agent_wallet     = create_wallet(agent_set_id, "agon-agent")
    evaluator_wallet = create_wallet(agent_set_id, "agon-evaluator")

    agent_addr     = agent_wallet["address"]
    evaluator_addr = evaluator_wallet["address"]
    agent_id       = agent_wallet["id"]
    evaluator_id   = evaluator_wallet["id"]

    print("\n" + "=" * 50)
    print("Kurulum tamamlandı. .env'e ekle:\n")
    print(f"CIRCLE_WALLET_ID={agent_id}")
    print(f"CIRCLE_EVALUATOR_WALLET_ID={evaluator_id}")
    print()
    print("Wallet adresleri (IdentityRegistry'e kayıt için):")
    print(f"  Agent     : {agent_addr}")
    print(f"  Evaluator : {evaluator_addr}")
    print()
    print("ÖNEMLI: Bu adresleri IdentityRegistry'e kayıt ettirmen gerekiyor.")
    print("Sonra her wallet'a Arc Testnet'ten USDC gönder (stake + gas için).")
    print("=" * 50)


if __name__ == "__main__":
    main()
