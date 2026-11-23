# Blank Form Fields Policy

New-entry forms open empty. Fields are filled only by the user, or by saved records when editing. Placeholders are short instructions, never sample values.

## What changed

**Placeholders (47 replaced).** Every placeholder that showed example data now gives an instruction. Examples: `ABC Technologies` became *Enter business name*; `+91 98765 43210` became *Enter mobile number*; `sales@company.com` became *Enter email address*; `Dell, HP, Lenovo` became *Search brands*; `Latitude 5450` became *Enter model name*; `07ABCDE1234F1Z5` became *Enter GSTIN*; `30,60,90` became *Enter days, comma-separated*; `Laptops` became *Enter category name*.

**Validation and help text (13 messages and hints).** Messages such as "Enter a valid website, e.g. www.example.com." now state the rule without the example value. Example: *Enter a valid website address.*

**Dropdowns.** A select with no placeholder used to show its first option as if chosen, and that value was submitted. The shared `SelectField` now always begins blank. The Vendor Type dropdown, which had been showing its first option, now starts blank.

**Date and quantity fields.** The delivery date no longer starts as today's date; the hint says a blank date means today. The enquiry and quotation dates were already required, and now start empty. The default item quantity of 1 on enquiries and quotations is cleared, and the field is required.

**Movement type and document type.** The stock movement type and the delivery and OCR document-type selects start unset, with a *Select* option, and are required.

**Customer type.** Starts unset and is required, with a validation message. Previously it defaulted to Business.

**Login.** The *Remember me* box is no longer ticked by default. The email and password fields were already empty.

## Defaults kept on purpose

These are the only prefilled values left on new-entry forms. Each one is a default the database or the business already defines, not sample data. They can be changed on the record.

| Field | Default | Why it stays |
|---|---|---|
| Status (customer, vendor, product) | Active | Matches the database default for new records |
| Currency (enquiry, quotation) | INR | Business currency; set by the database default |
| Unit (enquiry, quotation lines) | Nos | Matches the database default unit |
| Country / tax country | India | Business is India-based; the GST and PAN rules depend on it |
| Priority (enquiry) | Normal | Database default |
| Discount (quotation line) | No discount | A neutral option, not a value |
| Primary contact / default address | First row marked | Structural: every customer and vendor needs one primary contact and address |
| Contact type on the first contact row | General | Database default for contact type |
| Address type on the first address row | Registered Office (vendor) / Billing (customer) | Matches the first address the business records |

If you want any of these blank on create, they can be changed; the defaults above are the trade-off I chose, since blanking them would break validation for an otherwise required field.

## Kept as saved data

Settings values are the configured business values, not form defaults: the invoice prefix, number padding, financial-year start, and the payment method list. Edit forms load the saved record's values; this was checked on the brand edit dialog, which shows the saved name and code.

## Verification

- Web TypeScript: pass. Production build: pass.
- Browser audit of create forms (vendors, products, customers, enquiries, quotations, payments, deliveries, users, brands, product and customer categories, enquiry sources, OCR, appearance, account, login):
  - No placeholder contains sample data. Checked by pattern: no `e.g.`, `@`, phone numbers, dummy brand names, or example domains remain.
  - Every field is empty except the defaults in the table above.
- Login suite: 31 of 31 pass.
- Edit path: the brand edit dialog loads its saved name and code.

## Not changed

- Filter and search boxes on list pages are still empty until used, and filter selects default to *All*. These are not data-entry forms.
- Format descriptions that name the expected pattern (for example a CIN or GSTIN shape in an error message) keep the rule, but the sample value was removed from the message.
