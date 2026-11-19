import type { CustomerAddressType, CustomerType } from './types';

/** Display labels for Customer Management. */

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  INDIVIDUAL: 'Individual',
  BUSINESS: 'Business',
};

export const CUSTOMER_ADDRESS_TYPE_LABELS: Record<CustomerAddressType, string> = {
  BILLING: 'Billing Address',
  SHIPPING: 'Shipping Address',
  OFFICE: 'Office Address',
  REGISTERED: 'Registered Address',
  OTHER: 'Other',
};

export const CUSTOMER_DOCUMENT_KIND_LABELS = {
  CUSTOMER_GST_CERTIFICATE: 'GST Certificate',
  CUSTOMER_PAN: 'PAN Document',
  CUSTOMER_REGISTRATION_CERTIFICATE: 'Company Registration Certificate',
  CUSTOMER_AGREEMENT: 'Business Agreement',
  CUSTOMER_PURCHASE_AUTHORIZATION: 'Purchase Authorization',
  CUSTOMER_OTHER: 'Other Document',
} as const;

/** Suggested values; the fields stay free text so they remain configurable. */
export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];
export const TURNOVER_RANGES = ['Up to 1 Cr', '1-10 Cr', '10-50 Cr', '50-250 Cr', '250 Cr+'];
export const BUSINESS_TYPES = ['Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'Public Limited', 'Government', 'Trust / NGO', 'Other'];

export const isIndia = (country: string) => /^(india|in|bharat)$/i.test(country.trim());
