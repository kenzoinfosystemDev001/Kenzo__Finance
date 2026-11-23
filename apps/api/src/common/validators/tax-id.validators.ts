import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { isValidGstin, isValidPan } from '../utils/tax-id';

export function IsGstin(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isGstin',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined || value === null || value === '') return true;
          return typeof value === 'string' && isValidGstin(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be 15 letters or digits (GSTIN)`;
        },
      },
    });
  };
}

export function IsPan(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isPan',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined || value === null || value === '') return true;
          return typeof value === 'string' && isValidPan(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid PAN (example: ABCDE1234F)`;
        },
      },
    });
  };
}
