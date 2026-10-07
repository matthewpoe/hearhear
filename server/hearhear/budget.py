"""A daily token budget, kept in memory.

One uvicorn worker serves every request, so one counter is global. It resets
at midnight UTC and on every redeploy; the true hard cap is the spend limit on
the Anthropic Console workspace.
"""

from collections.abc import Callable
from datetime import UTC, date, datetime


def utc_today() -> date:
    return datetime.now(UTC).date()


class TokenBudget:
    def __init__(self, daily_limit: int, today: Callable[[], date] = utc_today) -> None:
        self.daily_limit = daily_limit
        self._today = today
        self._day = today()
        self._spent = 0

    @property
    def spent(self) -> int:
        self._roll_over()
        return self._spent

    def exhausted(self) -> bool:
        """True once today's spend has reached the limit. A request already
        streaming may finish past it; the next one is turned away."""
        return self.spent >= self.daily_limit

    def spend(self, tokens: int) -> None:
        self._roll_over()
        self._spent += tokens

    def _roll_over(self) -> None:
        today = self._today()
        if today != self._day:
            self._day = today
            self._spent = 0
