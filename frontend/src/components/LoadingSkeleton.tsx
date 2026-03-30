/**
 * Loading Skeleton Component for better visual feedback during data loads
 */

export function LoadingSkeleton({ 
  rows = 3, 
  columns = 4, 
  variant = 'card' 
}: { 
  rows?: number; 
  columns?: number; 
  variant?: 'card' | 'line' | 'grid' 
}) {
  if (variant === 'line') {
    return (
      <div className="skeleton-line-group">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton-line"></div>
        ))}
      </div>
    );
  }

  if (variant === 'grid') {
    return (
      <div className="skeleton-grid" data-columns={columns}>
        {Array.from({ length: rows * columns }).map((_, i) => (
          <div key={i} className="skeleton-card"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="skeleton-card">
      <div className="skeleton-header"></div>
      <div className="skeleton-body">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton-line"></div>
        ))}
      </div>
    </div>
  );
}

// CSS for skeleton loading
export const skeletonStyles = `
.skeleton-line-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-line {
  height: 20px;
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.1) 25%, rgba(0, 212, 255, 0.2) 50%, rgba(0, 212, 255, 0.1) 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 4px;
}

.skeleton-card {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 6px;
  padding: 20px;
}

.skeleton-header {
  height: 24px;
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.1) 25%, rgba(0, 212, 255, 0.2) 50%, rgba(0, 212, 255, 0.1) 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 4px;
  margin-bottom: 15px;
  width: 60%;
}

.skeleton-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 15px;
}

.skeleton-grid[data-columns="2"] {
  grid-template-columns: repeat(2, 1fr);
}

.skeleton-grid[data-columns="3"] {
  grid-template-columns: repeat(3, 1fr);
}

.skeleton-grid[data-columns="4"] {
  grid-template-columns: repeat(4, 1fr);
}

.skeleton-grid[data-columns="5"] {
  grid-template-columns: repeat(5, 1fr);
}

.skeleton-grid .skeleton-card {
  height: 150px;
  padding: 0;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
`;
