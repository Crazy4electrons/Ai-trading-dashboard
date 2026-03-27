#!/usr/bin/env python
"""
Run TradeMatrix backend with HTTP/2 support enabled
Uses Hypercorn for native HTTP/2 cleartext (h2c) support
"""
import subprocess
import sys

def main():
    print("=" * 70)
    print("TradeMatrix Backend - HTTP/2 Enabled (Hypercorn)")
    print("=" * 70)
    print("Starting server with:")
    print("  • Protocol: HTTP/2 (cleartext h2c) + WebSocket")
    print("  • Host: 0.0.0.0")
    print("  • Port: 8000")
    print("  • Auto-reload: Enabled")
    print("=" * 70)
    print()
    print("Verify HTTP/2 is active:")
    print("  1. Open browser DevTools (F12)")
    print("  2. Go to Network tab")
    print("  3. Check 'Protocol' column for 'h2' or 'h2c'")
    print()
    print("=" * 70)
    print()
    
    try:
        # Run hypercorn via subprocess
        # This is simpler and more reliable than trying to use the async API
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "hypercorn",
                "main:app",
                "--bind",
                "0.0.0.0:8000",
                "--reload",
            ],
            cwd=".",
        )
        sys.exit(result.returncode)
        
    except KeyboardInterrupt:
        print("\n\nShutting down server...")
        sys.exit(0)
    except FileNotFoundError:
        print("Error: hypercorn not found.", file=sys.stderr)
        print("Install it with: uv add hypercorn", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error starting server: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
