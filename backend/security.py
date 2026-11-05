"""Standard-library scrypt password hashing and opaque bearer-token digests."""
import hashlib
import hmac
import secrets


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    # OWASP's memory-constrained scrypt profile: 16 MiB with parallelization 5.
    value = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=5, dklen=64)
    return f"scrypt$16384$8$5${salt.hex()}${value.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt" or (n, r, p) != ("16384", "8", "5"):
            return False
        value = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=64)
        return hmac.compare_digest(value.hex(), expected)
    except (ValueError, TypeError, UnicodeError):
        return False


# Unknown usernames incur the same expensive password check; never a usable account.
DUMMY_HASH = hash_password(secrets.token_urlsafe(32))
