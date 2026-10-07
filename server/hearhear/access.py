"""The live tutor's passphrase gate and its per-IP lockout on wrong guesses.

The code comes from TUTOR_ACCESS_CODE and arrives in the X-Tutor-Access
header. Neither string is ever logged, raised, or returned: callers learn only
whether it matched.
"""

import hmac
import math
import time
from collections.abc import Callable

# Wrong guesses allowed per IP in one window. The comparison forgives case,
# spacing, and punctuation, which shrinks the search space, so the limit is
# much tighter than the tutor's own rate limit.
MAX_WRONG_GUESSES = 5
LOCKOUT_WINDOW_SECONDS = 10 * 60


def normalize(code: str) -> bytes:
    """Casefolded, with everything but letters and digits removed.

    Returned as UTF-8 bytes because `hmac.compare_digest` accepts only ASCII
    `str`, and a passphrase may not be ASCII.
    """
    return "".join(ch for ch in code.casefold() if ch.isalnum()).encode()


def code_matches(given: str | None, expected: bytes) -> bool:
    """True when the header's code normalizes to the expected one.

    `expected` is already normalized and never empty (startup refuses an empty
    code), so a header that normalizes to nothing never matches. The comparison
    takes constant time for codes of equal length.
    """
    if given is None:
        return False
    return hmac.compare_digest(normalize(given), expected)


class AccessLockout:
    """Counts wrong codes per client IP over a sliding window, in memory.

    One uvicorn worker serves every request, so one table is global. It resets
    on redeploy, like the token budget.
    """

    def __init__(
        self,
        max_wrong: int = MAX_WRONG_GUESSES,
        window_seconds: float = LOCKOUT_WINDOW_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_wrong = max_wrong
        self.window_seconds = window_seconds
        self._clock = clock
        self._wrong: dict[str, list[float]] = {}

    def retry_after(self, ip: str) -> int | None:
        """Whole seconds until `ip` may guess again, or None if it isn't locked."""
        recent = self._recent(ip)
        if len(recent) < self.max_wrong:
            return None
        # The window frees a guess when the oldest of the last `max_wrong` expires.
        unlocks_at = recent[-self.max_wrong] + self.window_seconds
        return max(1, math.ceil(unlocks_at - self._clock()))

    def record_wrong(self, ip: str) -> None:
        self._forget_expired()
        self._wrong.setdefault(ip, []).append(self._clock())

    def _recent(self, ip: str) -> list[float]:
        cutoff = self._clock() - self.window_seconds
        return [at for at in self._wrong.get(ip, []) if at > cutoff]

    def _forget_expired(self) -> None:
        """Drop guesses older than the window, so the table holds only IPs
        that guessed wrong recently."""
        for ip in list(self._wrong):
            recent = self._recent(ip)
            if recent:
                self._wrong[ip] = recent
            else:
                del self._wrong[ip]
