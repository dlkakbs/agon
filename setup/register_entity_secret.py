"""
Circle Entity Secret oluştur ve kayıt et.

Kullanım:
  pip3 install requests cryptography --break-system-packages
  python3 setup/register_entity_secret.py

Sana soracağı tek şey: CIRCLE_API_KEY
Gerisi otomatik.
"""

import os
import sys
import secrets
import base64
import requests
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

BASE = "https://api.circle.com/v1/w3s"


def _write_env(env_path: Path, api_key: str, entity_secret: str):
    env_content = env_path.read_text() if env_path.exists() else ""
    lines = env_content.splitlines()
    new_lines = []
    added_key = added_secret = False
    for line in lines:
        if line.startswith("CIRCLE_API_KEY="):
            new_lines.append(f"CIRCLE_API_KEY={api_key}"); added_key = True
        elif line.startswith("CIRCLE_ENTITY_SECRET="):
            new_lines.append(f"CIRCLE_ENTITY_SECRET={entity_secret}"); added_secret = True
        else:
            new_lines.append(line)
    if not added_key:    new_lines.append(f"CIRCLE_API_KEY={api_key}")
    if not added_secret: new_lines.append(f"CIRCLE_ENTITY_SECRET={entity_secret}")
    env_path.write_text("\n".join(new_lines) + "\n")
    print(f".env güncellendi ✓")


def main():
    api_key = input("CIRCLE_API_KEY: ").strip()
    if not api_key:
        print("API key boş olamaz.")
        sys.exit(1)

    # 1. Entity secret üret (32 byte random hex)
    entity_secret = secrets.token_hex(32)
    print(f"\nEntity Secret: {entity_secret}")
    print("⚠️  Bu değeri güvenli bir yere kaydet — bir daha göremezsin!\n")

    # 2. Circle public key al
    print("Circle public key alınıyor...")
    resp = requests.get(
        f"{BASE}/config/entity/publicKey",
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=10,
    )
    if resp.status_code != 200:
        print(f"Hata: {resp.status_code} — {resp.text}")
        sys.exit(1)
    public_key_pem = resp.json()["data"]["publicKey"]
    print("Public key alındı ✓")

    # 3. RSA-OAEP SHA256 ile şifrele
    public_key = serialization.load_pem_public_key(public_key_pem.encode())
    encrypted = public_key.encrypt(
        bytes.fromhex(entity_secret),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    ciphertext = base64.b64encode(encrypted).decode()
    print("Ciphertext oluşturuldu ✓")

    # 4. Circle'a kayıt et
    print("Entity secret kayıt ediliyor...")
    # Circle'ın entity secret kayıt endpoint'ini dene
    endpoints = [
        ("POST", f"{BASE}/config/entity/secret"),
        ("PUT",  f"{BASE}/config/entity/secret"),
        ("POST", "https://api.circle.com/v1/config/entity/secret"),
    ]
    resp = None
    for method, url in endpoints:
        r = requests.request(
            method, url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"entitySecretCiphertext": ciphertext},
            timeout=15,
        )
        print(f"  {method} {url} → {r.status_code}")
        if r.status_code in (200, 201):
            resp = r
            break
    if resp is None:
        print("\nOtomatik kayıt başarısız.")
        print("Manuel kayıt için: https://console.circle.com → Developer-Controlled Wallets → Entity Secret")
        print(f"\nCiphertext (console'a yapıştır):\n{ciphertext}")
        print(f"\nEntity Secret (.env'e ekle):\nCIRCLE_ENTITY_SECRET={entity_secret}")
        # Yine de .env'e entity secret'ı yaz
        _write_env(env_path, api_key, entity_secret)
        sys.exit(0)

    print("Entity secret kayıt edildi ✓\n")

    # 5. .env'e yaz
    env_path = Path(__file__).parent.parent / ".env"
    _write_env(env_path, api_key, entity_secret)

    print("=" * 50)
    print("Sonraki adım: wallet oluştur")
    print("  python3 setup/create_circle_wallets.py")
    print("=" * 50)


if __name__ == "__main__":
    main()
