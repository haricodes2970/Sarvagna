import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center">
            <div className="inline-flex p-4 bg-red-500/10 border border-red-500/20 rounded-2xl mb-6">
              <AlertTriangle size={32} className="text-red-400" />
            </div>
            <h2 className="text-xl font-black text-white mb-2">Something went wrong</h2>
            <p className="text-zinc-500 text-sm mb-2">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <p className="text-zinc-600 text-xs mb-8">
              If this keeps happening, try refreshing the page.
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold rounded-xl transition-colors"
            >
              <RefreshCw size={14} />
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
