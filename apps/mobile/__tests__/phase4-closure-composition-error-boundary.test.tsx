import { act, create } from 'react-test-renderer';

jest.mock('../src/components/ui', () => {
  const React = require('react');
  return { ErrorState: (props: { title?: string; onRetry(): void }) => React.createElement('controlled-error', props) };
});

import { CompositionErrorBoundary } from '../src/creation/composition-error-boundary';

function BrokenRenderer(): React.JSX.Element {
  throw new TypeError('synthetic renderer failure containing no patient data');
}

describe('Phase 4 Closure Stage 1 composition error boundary', () => {
  it('contains renderer failure in controlled recovery UI and logs safe diagnostic metadata only', () => {
    const recover = jest.fn();
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<CompositionErrorBoundary onRecover={recover}><BrokenRenderer /></CompositionErrorBoundary>); });
    const fallback = tree!.root.findByProps({ title: 'Composition unavailable' });
    expect(fallback.props.title).toBe('Composition unavailable');
    expect(log).toHaveBeenCalledWith('composition-render-failure', { component: 'creation-preview', errorName: 'TypeError' });
    act(() => fallback.props.onRetry());
    expect(recover).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
