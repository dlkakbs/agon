"""
Circle Developer-Controlled Wallet — kontrat çağrı katmanı.

Circle REST API üzerinden BountyRegistry fonksiyonlarını çağırır.
Entity secret RSA-OAEP ile şifrelenir, her istekte yeni ciphertext üretilir.

Gerekli env:
  CIRCLE_API_KEY        - Circle API anahtarı
  CIRCLE_ENTITY_SECRET  - 32-byte hex entity secret
  CIRCLE_WALLET_ID      - Agent için önceden oluşturulmuş wallet ID
  CIRCLE_BLOCKCHAIN     - Circle zincir tanımlayıcısı (örn: "ARC-TESTNET")
"""

import os
import time
import base64
import logging
import requests
from uuid import uuid4
from web3 import Web3
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

log = logging.getLogger("circle")

CIRCLE_API_BASE  = "https://api.circle.com/v1/w3s"
TERMINAL_STATES  = {"COMPLETE", "FAILED", "DENIED", "CANCELLED"}


def _encrypt_entity_secret(api_key: str, entity_secret_hex: str) -> str:
    """Circle public key ile entity secret'ı RSA-OAEP SHA256 ile şifrele."""
    resp = requests.get(
        f"{CIRCLE_API_BASE}/config/entity/publicKey",
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=10,
    )
    resp.raise_for_status()
    public_key_pem = resp.json()["data"]["publicKey"]

    entity_secret_bytes = bytes.fromhex(entity_secret_hex)
    public_key = serialization.load_pem_public_key(public_key_pem.encode())
    encrypted = public_key.encrypt(
        entity_secret_bytes,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(encrypted).decode()


class CircleWallet:
    """
    Circle Developer-Controlled Wallet üzerinden kontrat çağrısı yapar.
    Wallet oluşturma için setup/create_circle_wallets.py kullan.
    """

    def __init__(self, wallet_id: str, blockchain: str, w3: Web3):
        self.wallet_id      = wallet_id
        self.blockchain     = blockchain
        self.w3             = w3
        self._api_key       = os.environ["CIRCLE_API_KEY"]
        self._entity_secret = os.environ["CIRCLE_ENTITY_SECRET"]
        self._address: str | None = None

    @property
    def address(self) -> str:
        if not self._address:
            resp = requests.get(
                f"{CIRCLE_API_BASE}/wallets/{self.wallet_id}",
                headers={"Authorization": f"Bearer {self._api_key}"},
                timeout=10,
            )
            resp.raise_for_status()
            self._address = resp.json()["data"]["wallet"]["address"]
        return self._address

    def balance(self) -> str:
        raw = self.w3.eth.get_balance(Web3.to_checksum_address(self.address))
        return f"{self.w3.from_wei(raw, 'ether'):.6f} USDC"

    def execute_contract(
        self,
        contract_address: str,
        abi_function_signature: str,
        abi_parameters: list,
        native_amount: str | None = None,
    ) -> str:
        """
        Kontrat fonksiyonu çalıştır, Circle transaction ID döndür.

        native_amount: Payable fonksiyon için USDC miktarı (string, örn "1.5").
        Arc'ta native token = USDC olduğundan msg.value için kullanılır.
        """
        ciphertext = _encrypt_entity_secret(self._api_key, self._entity_secret)

        body: dict = {
            "idempotencyKey":           str(uuid4()),
            "walletId":                 self.wallet_id,
            "blockchain":               self.blockchain,
            "contractAddress":          contract_address,
            "abiFunctionSignature":     abi_function_signature,
            "abiParameters":            abi_parameters,
            "entitySecretCiphertext":   ciphertext,
            "fee": {"type": "level", "config": {"feeLevel": "MEDIUM"}},
        }
        if native_amount is not None:
            body["nativeAmount"] = native_amount

        resp = requests.post(
            f"{CIRCLE_API_BASE}/developer/transactions/contractExecution",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type":  "application/json",
            },
            json=body,
            timeout=30,
        )
        resp.raise_for_status()
        tx_id = resp.json()["data"]["id"]
        log.info(f"Circle tx başlatıldı: {tx_id}")
        return tx_id

    def wait(self, tx_id: str, timeout: int = 120, poll: int = 3) -> str:
        """Circle tx COMPLETE olana kadar bekle, txHash döndür."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            resp = requests.get(
                f"{CIRCLE_API_BASE}/transactions/{tx_id}",
                headers={"Authorization": f"Bearer {self._api_key}"},
                timeout=10,
            )
            resp.raise_for_status()
            tx    = resp.json()["data"]["transaction"]
            state = tx.get("state", "")
            if state in TERMINAL_STATES:
                if state != "COMPLETE":
                    raise RuntimeError(f"Circle tx {state}: {tx_id}")
                tx_hash = tx.get("txHash", tx_id)
                log.info(f"Confirmed: {tx_hash}")
                return tx_hash
            time.sleep(poll)
        raise TimeoutError(f"Circle tx zaman aşımı: {tx_id}")
