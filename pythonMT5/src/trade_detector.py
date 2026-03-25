"""
Trade completion detector
Monitors open positions for closes and emits trade close events with P&L and balance
"""
import threading
import time
from typing import Dict, Set, Any
import MetaTrader5 as mt5
from logger import logger, log_mt5_event, log_error_with_context
from websocket_client import get_ws_client
from mt5_handler import get_mt5_handler


class TradeDetector:
    """Detects and reports closed positions"""
    
    def __init__(self, poll_interval: int = 5):
        """
        Initialize trade detector
        
        Args:
            poll_interval: Seconds between position polls (default 5s)
        """
        self.poll_interval = poll_interval
        self.detecting = False
        self.detector_thread = None
        self._stop_event = threading.Event()
        self.last_positions = {}  # ticket -> position data
        self.closed_tickets = set()  # Tickets we've already reported
    
    def start_detection(self):
        """Start detecting trade closes"""
        if self.detecting:
            logger.warning("Trade detection already running")
            return
        
        self._stop_event.clear()
        self.detecting = True
        
        self.detector_thread = threading.Thread(target=self._detection_loop, daemon=True)
        self.detector_thread.start()
        
        log_mt5_event("Trade detection started", {"poll_interval": self.poll_interval})
    
    def stop_detection(self):
        """Stop detecting trade closes"""
        self._stop_event.set()
        self.detecting = False
        if self.detector_thread:
            self.detector_thread.join(timeout=5)
        log_mt5_event("Trade detection stopped")
    
    def _detection_loop(self):
        """Background loop for monitoring positions"""
        try:
            logger.info("[Trade Detector] Loop started")
            
            while not self._stop_event.is_set():
                try:
                    # Get current open positions
                    positions = mt5.positions_get()
                    
                    if positions is None:
                        logger.warning("Could not fetch positions")
                        time.sleep(self.poll_interval)
                        continue
                    
                    current_tickets = set()
                    current_positions_map = {}
                    
                    # Map current positions by ticket
                    for pos in positions:
                        current_tickets.add(pos.ticket)
                        current_positions_map[pos.ticket] = pos
                    
                    # Detect closes: positions that were open but are no longer
                    closed_tickets = set(self.last_positions.keys()) - current_tickets
                    
                    # Report closed trades via WebSocket
                    for ticket in closed_tickets:
                        if ticket not in self.closed_tickets:
                            self._report_closed_trade(ticket, self.last_positions[ticket])
                            self.closed_tickets.add(ticket)
                    
                    # Update last positions
                    self.last_positions = current_positions_map
                    
                    # Log current open positions
                    if current_tickets:
                        logger.debug(f"[Positions] Open count: {len(current_tickets)}")
                    
                    time.sleep(self.poll_interval)
                    
                except Exception as e:
                    log_error_with_context(e, "Position polling error")
                    time.sleep(self.poll_interval)
            
            logger.info("[Trade Detector] Loop ended")
            
        except Exception as e:
            log_error_with_context(e, "Trade detection loop fatal error")
    
    def _report_closed_trade(self, ticket: int, position: Any):
        """
        Report a closed trade with P&L and balance
        
        Args:
            ticket: Position ticket number
            position: Position object before close
        """
        try:
            # Get closed deal from history
            # Search trade history for this ticket's close
            deals = mt5.history_deals_get()
            
            close_price = None
            close_time = None
            
            if deals:
                for deal in deals:
                    if deal.ticket == ticket:
                        # Found deal matching this position
                        close_price = deal.price
                        close_time = deal.time
                        break
            
            # If we can't find exact close, estimate from last tick
            if not close_price:
                tick = mt5.symbol_info_tick(position.symbol)
                if tick:
                    close_price = tick.ask if position.type == 0 else tick.bid
                else:
                    logger.warning(f"Cannot determine close price for ticket {ticket}")
                    return
            
            if not close_time:
                close_time = time.time()
            
            # Calculate P&L
            if position.type == 0:  # BUY
                profit_loss = (close_price - position.price_open) * position.volume
            else:  # SELL
                profit_loss = (position.price_open - close_price) * position.volume
            
            # Get current account balance
            account_info = mt5.account_info()
            if not account_info:
                logger.warning("Cannot get account info for balance snapshot")
                return
            
            balance = account_info.balance
            
            # Get account ID from handler
            handler = get_mt5_handler()
            account_id = handler.account_id or 0
            
            # Get open time from position
            open_time = int(position.time) if hasattr(position, 'time') else int(time.time())
            close_time_int = int(close_time) if close_time else int(time.time())
            
            trade_data = {
                "account_id": account_id,
                "symbol": position.symbol,
                "type": "BUY" if position.type == 0 else "SELL",
                "volume": float(position.volume),
                "open_price": float(position.price_open),
                "entry_price": float(position.price_open),
                "exit_price": float(close_price),
                "open_time": open_time,
                "close_time": close_time_int,
                "profit_loss": float(profit_loss),
                "balance": float(balance),
                "timestamp": int(close_time_int * 1000) if close_time_int else int(time.time() * 1000)
            }
            
            logger.info(f"[Trade Close] {trade_data['symbol']} {trade_data['type']} "
                       f"P&L: {trade_data['profit_loss']:.2f}, Balance: {balance:.2f}")
            
            # Send via WebSocket to Node for recording
            ws_client = get_ws_client()
            if ws_client.is_connected():
                ws_client.send_trade_close(trade_data)
            else:
                logger.warning("WebSocket not connected, cannot report closed trade")
            
        except Exception as e:
            log_error_with_context(e, f"Failed to report closed trade {ticket}")
    
    def reset(self):
        """Reset tracking state (e.g., on new login)"""
        self.last_positions = {}
        self.closed_tickets = set()
        logger.debug("Trade detector state reset")


# Global trade detector instance
_trade_detector = None


def get_trade_detector() -> TradeDetector:
    """Get or create global trade detector"""
    global _trade_detector
    if _trade_detector is None:
        poll_interval = int(__import__('os').getenv('POSITION_POLL_INTERVAL_SECONDS', 5))
        _trade_detector = TradeDetector(poll_interval=poll_interval)
    return _trade_detector


if __name__ == "__main__":
    detector = TradeDetector()
    detector.start_detection()
    
    time.sleep(30)
    
    detector.stop_detection()
