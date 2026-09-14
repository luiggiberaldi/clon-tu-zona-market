import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renderiza texto y attrs', () => {
    render(<Button>Comprar</Button>);
    expect(screen.getByText('Comprar')).toBeDefined();
    expect(screen.getByText('Comprar').tagName).toBe('BUTTON');
  });

  it('aplica variants', () => {
    render(<Button variant="destructive">Borrar</Button>);
    const btn = screen.getByText('Borrar');
    expect(btn.className).toContain('bg-destructive');
  });

  it('es disabled', () => {
    render(<Button disabled>No</Button>);
    expect((screen.getByText('No') as HTMLButtonElement).disabled).toBe(true);
  });
});
