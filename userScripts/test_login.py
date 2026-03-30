import MetaTrader5 as mt5

mt = mt5.initialize()
if not mt:
    print("MT5 initialization failed")  
    print(f"Error code: {mt5.last_error()}")
else:
    print("MT5 initialized successfully")