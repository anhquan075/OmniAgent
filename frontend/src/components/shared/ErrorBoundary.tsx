import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#120b0a] p-4">
          <div className="w-full max-w-md rounded-lg border border-[#e63f37]/40 bg-[#1f1311] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e63f37]/20">
                <svg className="h-5 w-5 text-[#ff776d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#fff8ef]">Something went wrong</h2>
            </div>
            
            <p className="mb-4 text-sm text-[#c8b9ad]">
              The application encountered an unexpected error. Please refresh the page to try again.
            </p>
            
            {this.state.error && (
              <details className="mb-4">
                <summary className="-mx-2 inline-flex min-h-11 cursor-pointer items-center rounded px-2 text-sm text-[#8f7f73] hover:text-[#c8b9ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff776d]">
                  Error details
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-[#120b0a]/80 p-2 text-xs text-[#ff776d]">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-[#e63f37] px-4 py-3 font-medium text-[#fff8ef] transition-colors hover:bg-[#ff776d]"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
