import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

/**
 * Phone numbers as people actually type them: "+91 98765 43210",
 * "022-2345 6789", "(080) 4123 4567". Only digits, spaces, hyphens, dots,
 * brackets and one leading "+" are allowed, and the digit count must be a
 * plausible E.164 length (7-15). Blank values pass; use IsNotEmpty to require.
 */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function IsPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined || value === null || value === '') return true;
          return typeof value === 'string' && isValidPhone(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid phone number (7-15 digits, optional leading +)`;
        },
      },
    });
  };
}
