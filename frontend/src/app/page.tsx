import { redirect } from 'next/navigation';

/**
 * The application has no public home page. `/` goes straight to sign-in; the
 * sign-in page forwards an already-signed-in user on to the dashboard, and the
 * dashboard layout sends anyone without a session back here.
 */
export default function RootPage() {
  redirect('/login');
}
