import type { Metadata } from 'next';
import { AuthCard } from '../auth-card';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot password?" subtitle="Enter your account email and we will send you a link to reset your password.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
