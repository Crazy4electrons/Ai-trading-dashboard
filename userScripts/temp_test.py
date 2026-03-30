import asyncio
from app.services.mt5_adapter import mt5_manager

async def test():
    res = await mt5_manager.get_rates('EURUSD', 60, 100)
    print('Returned', len(res) if res else None)
    print(res[:3] if res else None)

asyncio.run(test())
