import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorState } from '../components/ui';

type CompositionErrorBoundaryProps = {
  readonly children: ReactNode;
  readonly onRecover: () => void;
};
type CompositionErrorBoundaryState = { readonly failed: boolean };

/** Local fault containment for malformed composition/renderer state; never logs image bytes or document payloads. */
export class CompositionErrorBoundary extends Component<CompositionErrorBoundaryProps, CompositionErrorBoundaryState> {
  state: CompositionErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): CompositionErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    const errorName = error instanceof Error ? error.name : 'unknown';
    // Safe diagnostic metadata only: no source URI, patient data, document, or renderer payload.
    console.error('composition-render-failure', { component: 'creation-preview', errorName });
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <ErrorState title="Composition unavailable" detail="The composition could not be rendered safely. Reload the secured draft and try again." onRetry={() => {
        this.setState({ failed: false });
        this.props.onRecover();
      }} />;
    }
    return this.props.children;
  }
}
