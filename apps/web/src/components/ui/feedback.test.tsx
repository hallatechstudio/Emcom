import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@emcom/api-client';
import { ErrorState } from './feedback';

describe('ErrorState', () => {
  it('shows the API message and request reference', () => {
    render(<ErrorState error={new ApiError(403, 'INSUFFICIENT_ROLE', 'This action requires a higher community role', undefined, 'req-123')} />);
    expect(screen.getByRole('alert').textContent).toContain('This action requires a higher community role');
    expect(screen.getByRole('alert').textContent).toContain('req-123');
  });
});
