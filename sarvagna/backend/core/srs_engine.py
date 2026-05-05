"""
srs_engine.py — SuperMemo-2 (SM-2) spaced-repetition algorithm.

Rating scale (1-5):
  1 = Blackout  — complete fail
  2 = Incorrect — familiar but wrong
  3 = Correct   — with difficulty
  4 = Correct   — with hesitation
  5 = Perfect   — instant recall

Reference: Wozniak, P. (1990). Optimization of learning.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from math import ceil


@dataclass
class SRSResult:
    easiness_factor: float
    interval: int           # days until next review
    repetitions: int
    next_review_date: date


def sm2(
    rating: int,
    easiness_factor: float = 2.5,
    interval: int = 1,
    repetitions: int = 0,
) -> SRSResult:
    """
    Apply one SM-2 iteration.

    Args:
        rating:          User self-assessment 1-5.
        easiness_factor: Current EF (default 2.5, min 1.3).
        interval:        Current interval in days.
        repetitions:     Number of successful repetitions so far.

    Returns:
        SRSResult with updated fields and next_review_date.
    """
    if rating < 1 or rating > 5:
        raise ValueError(f"rating must be 1-5, got {rating}")

    if rating < 3:
        # Failed — reset streak, review soon
        new_repetitions = 0
        new_interval = 1
    else:
        # Successful recall
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = ceil(interval * easiness_factor)
        new_repetitions = repetitions + 1

    # Update EF — clamped to [1.3, 3.0]
    new_ef = easiness_factor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02))
    new_ef = max(1.3, min(3.0, new_ef))

    return SRSResult(
        easiness_factor=round(new_ef, 3),
        interval=new_interval,
        repetitions=new_repetitions,
        next_review_date=date.today() + timedelta(days=new_interval),
    )
