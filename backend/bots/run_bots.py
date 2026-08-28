import asyncio
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.bots.telegram import run_telegram_bot


async def main() -> None:
    await run_telegram_bot()


def run() -> None:
    asyncio.run(main())


if __name__ == "__main__":
    run()
