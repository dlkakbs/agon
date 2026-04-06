"""Cüzdan ve işlem imzalama/gönderme katmanı."""

from web3 import Web3


class Wallet:
    def __init__(self, w3: Web3, private_key: str):
        self.w3 = w3
        account = w3.eth.account.from_key(private_key)
        self.address = account.address
        self._key = private_key

    def balance(self) -> str:
        raw = self.w3.eth.get_balance(self.address)
        return f"{self.w3.from_wei(raw, 'ether'):.6f} USDC"

    def sign_and_send(self, tx: dict) -> str:
        """İşlemi imzala, gönder; tx hash döndür."""
        # gas tahmini
        if "gas" not in tx:
            tx["gas"] = self.w3.eth.estimate_gas(tx)
        if "gasPrice" not in tx and "maxFeePerGas" not in tx:
            tx["gasPrice"] = self.w3.eth.gas_price

        signed = self.w3.eth.account.sign_transaction(tx, self._key)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        return tx_hash.hex()

    def wait(self, tx_hash: str, timeout: int = 120) -> dict:
        """Receipt gelene kadar bekle."""
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)
        return receipt
