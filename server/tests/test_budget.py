from datetime import date

from hearhear.budget import TokenBudget


class Clock:
    def __init__(self) -> None:
        self.today = date(2026, 10, 7)

    def __call__(self) -> date:
        return self.today


def test_budget_is_exhausted_once_spend_reaches_the_limit() -> None:
    budget = TokenBudget(1000, today=Clock())
    budget.spend(999)
    assert not budget.exhausted()
    budget.spend(1)
    assert budget.exhausted()


def test_a_request_may_overshoot_but_the_next_is_refused() -> None:
    budget = TokenBudget(1000, today=Clock())
    budget.spend(5000)
    assert budget.spent == 5000
    assert budget.exhausted()


def test_budget_resets_at_the_next_utc_day() -> None:
    clock = Clock()
    budget = TokenBudget(1000, today=clock)
    budget.spend(1000)
    clock.today = date(2026, 10, 8)
    assert not budget.exhausted()
    assert budget.spent == 0
