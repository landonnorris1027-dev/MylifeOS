import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  title?: string;
  message?: string;
  resetLabel?: string;
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('UI boundary caught an error', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className={this.props.className || 'bg-white rounded-2xl border border-red-100 shadow-sm p-6'}>
        <div className="flex flex-col items-center justify-center text-center gap-4 min-h-[220px]">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {this.props.title || 'Something went wrong'}
            </h3>
            <p className="text-sm text-gray-500 max-w-md">
              {this.props.message || 'This part of the page failed to render. You can try loading it again.'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-black transition-colors"
          >
            <RefreshCw size={16} />
            {this.props.resetLabel || 'Try again'}
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
