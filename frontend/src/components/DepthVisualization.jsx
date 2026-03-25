/**
 * DepthVisualization — Order book depth display
 * Shows bid/ask levels with volume visualization
 */
import React from 'react';
import styles from './TradingChart.module.css';

export function DepthVisualization({ depth, width = 100, height = 300 }) {
  if (!depth || !depth.bids || !depth.asks) {
    return (
      <div style={{ width, height, background: 'rgba(30,45,61,0.3)', padding: '8px 4px' }}>
        <div style={{ fontSize: 9, color: '#7a8fa8', opacity: 0.5, textAlign: 'center', marginTop: 12 }}>
          No depth data
        </div>
      </div>
    );
  }

  const allLevels = [...depth.bids, ...depth.asks];
  const maxVolume = Math.max(...allLevels.map(l => l.volume), 1);
  const midHeight = height / 2;
  const levelHeight = height / 10; // Show 5 bid + 5 ask levels

  return (
    <div
      style={{
        width,
        height,
        background: 'rgba(30,45,61,0.3)',
        borderRight: '1px solid rgba(30,45,61,0.5)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Asks (top) */}
      <div style={{ flex: 0.5, overflow: 'hidden' }}>
        {depth.asks.slice(0, 5).reverse().map((level, i) => {
          const volPercent = (level.volume / maxVolume) * 100;
          return (
            <div
              key={`ask-${i}`}
              style={{
                height: `${100 / 5}%`,
                display: 'flex',
                position: 'relative',
                backgroundColor: `rgba(255, 61, 87, ${volPercent / 400})`,
                borderBottom: '1px solid rgba(30,45,61,0.2)',
                alignItems: 'center',
                paddingRight: 2,
                fontSize: 8,
                color: '#ff3d57',
                fontFamily: "'Space Mono', monospace",
              }}
            >
              {/* Volume bar */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  height: '100%',
                  width: `${volPercent}%`,
                  background: 'rgba(255, 61, 87, 0.3)',
                  transition: 'width 200ms ease-out',
                }}
              />
              {/* Text label */}
              <span style={{ position: 'relative', zIndex: 1, marginLeft: 2 }}>
                {level.price.toFixed(4)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Divider/Spread */}
      <div
        style={{
          height: 1,
          background: 'rgba(100,200,100,0.5)',
          margin: '2px 0',
        }}
      />

      {/* Bids (bottom) */}
      <div style={{ flex: 0.5, overflow: 'hidden' }}>
        {depth.bids.slice(0, 5).map((level, i) => {
          const volPercent = (level.volume / maxVolume) * 100;
          return (
            <div
              key={`bid-${i}`}
              style={{
                height: `${100 / 5}%`,
                display: 'flex',
                position: 'relative',
                backgroundColor: `rgba(0, 230, 118, ${volPercent / 400})`,
                borderBottom: '1px solid rgba(30,45,61,0.2)',
                alignItems: 'center',
                paddingRight: 2,
                fontSize: 8,
                color: '#00e676',
                fontFamily: "'Space Mono', monospace",
              }}
            >
              {/* Volume bar */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  height: '100%',
                  width: `${volPercent}%`,
                  background: 'rgba(0, 230, 118, 0.3)',
                  transition: 'width 200ms ease-out',
                }}
              />
              {/* Text label */}
              <span style={{ position: 'relative', zIndex: 1, marginLeft: 2 }}>
                {level.price.toFixed(4)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
