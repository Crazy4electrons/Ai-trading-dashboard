import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: { componentStack: string } | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('[ERROR BOUNDARY] Error caught:', error, errorInfo);
    this.setState({
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-container">
            <h2 className="error-title">❌ Something went wrong</h2>
            <details className="error-details">
              <summary className="error-summary">Error Details</summary>
              <pre className="error-stack">
                {this.state.error && this.state.error.toString()}
                {'\n\n'}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
            <button className="error-reset-btn" onClick={this.handleReset}>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// CSS for error boundary
export const errorBoundaryStyles = `
.error-boundary {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  padding: 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.error-container {
  background: rgba(231, 76, 60, 0.1);
  border: 2px solid #e74c3c;
  border-radius: 8px;
  padding: 30px;
  max-width: 600px;
  color: #e0e0e0;
}

.error-title {
  margin: 0 0 20px 0;
  color: #e74c3c;
  font-size: 20px;
  font-weight: 700;
}

.error-details {
  margin: 20px 0;
}

.error-summary {
  cursor: pointer;
  padding: 10px;
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 4px;
  color: #e74c3c;
  font-weight: 600;
  user-select: none;
}

.error-summary:hover {
  background: rgba(231, 76, 60, 0.15);
}

.error-stack {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(231, 76, 60, 0.2);
  border-radius: 4px;
  padding: 15px;
  margin: 10px 0;
  overflow-x: auto;
  font-size: 12px;
  color: #b0b0b0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.error-reset-btn {
  padding: 10px 20px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background-color 0.3s ease;
}

.error-reset-btn:hover {
  background-color: #c0392b;
}

.error-reset-btn:active {
  transform: translateY(1px);
}
`;
