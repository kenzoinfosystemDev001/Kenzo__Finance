import { ConflictException } from '@nestjs/common';
import { assertNotReferenced } from './master-delete';

describe('assertNotReferenced', () => {
  it('allows the delete when nothing refers to the master', () => {
    expect(() =>
      assertNotReferenced('The category "Laptops"', [
        { label: 'product', count: 0 },
        { label: 'customer', count: 0 },
      ]),
    ).not.toThrow();
  });

  it('refuses with a conflict naming each dependent group', () => {
    let caught: unknown;
    try {
      assertNotReferenced('The brand "Dell"', [
        { label: 'product', count: 3 },
        { label: 'vendor mapping', count: 1 },
      ]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).message).toBe(
      'The brand "Dell" cannot be deleted because it is used by 3 products, 1 vendor mapping. Deactivate it instead to keep the history intact.',
    );
  });

  it('singularises a count of one', () => {
    expect(() => assertNotReferenced('The source "Email"', [{ label: 'enquiry', count: 1 }])).toThrow(
      'used by 1 enquiry.',
    );
  });
});
